import { OrmaError } from '../../helpers/error_handling'
import {
    array_set_equals,
    group_by,
    is_simple_object,
    key_by
} from '../../helpers/helpers'
import {
    get_primary_keys,
    get_unique_column_groups
} from '../../helpers/schema_helpers'
import { orma_query } from '../../query/query'
import { combine_wheres } from '../../query/query_helpers'
import { OrmaSchema } from '../../schema/schema_types'
import { path_to_table } from '../helpers/mutate_helpers'
import { get_identifying_where } from '../helpers/record_searching'
import { MysqlFunction } from '../mutate'
import { MutationPiece, MutationPlan } from '../plan/mutation_batches'

/**
 * Generates errors when unique columns are duplicates in two cases:
 *   1. records from the mutation conflict with records in the database
 *   2. records from the mutation conflict with other records from the mutation
 *
 * @param orma_query a function which takes an orma query and gives the results of running the query
 * @returns
 */
export const get_unique_verification_errors = async (
    orma_schema: OrmaSchema,
    mysql_function: MysqlFunction,
    mutation_plan: Pick<MutationPlan, 'mutation_pieces' | 'guid_map'>
) => {
    /*
    check that no two rows have the same value for the same unique column, and also make sure that no unique value
    matches something already in the database

    algorithm:

    break up mutation by table name (keeping track of paths)
    construct a query which searches for all update and delete records in the database
    for each table name and each column, 
        check for no duplicates in the mutation
        check for no duplicates between mutation and database
    */

    const piece_indices_by_table = group_by(
        mutation_plan.mutation_pieces.map((_, i) => i),
        piece_index =>
            path_to_table(mutation_plan.mutation_pieces[piece_index].path)
    )

    const query = get_verify_uniqueness_query(
        orma_schema,
        mutation_plan,
        piece_indices_by_table
    )

    const results = await orma_query(query, orma_schema, mysql_function)

    const database_errors = get_database_uniqueness_errors(
        orma_schema,
        mutation_plan.mutation_pieces,
        piece_indices_by_table,
        results
    )
    const mutation_errors = get_mutation_uniqueness_errors(
        orma_schema,
        mutation_plan.mutation_pieces,
        piece_indices_by_table
    )

    return [...database_errors, ...mutation_errors]
}

/**
 * Gets a query which gets all relevant records from the database needed to do uniqueness checks.
 * Each record is uniquely identified by some combination of columns (e.g. primary key or combo unique columns).
 * The generated query will look up these records, selecting all the unique or combo unique columns
 */
export const get_verify_uniqueness_query = (
    orma_schema: OrmaSchema,
    mutation_plan: Pick<MutationPlan, 'mutation_pieces' | 'guid_map'>,
    piece_indices_by_table: Record<string, number[]>
) => {
    const { mutation_pieces, guid_map } = mutation_plan
    const mutation_tables = Object.keys(piece_indices_by_table)
    const query = mutation_tables.reduce((acc, table) => {
        // deleting a record never causes a unique constraint to be violated, so we only check creates and updates
        const searchable_piece_indices = piece_indices_by_table[table].filter(
            piece_index => {
                const operation = mutation_pieces[piece_index].record.$operation
                return ['create', 'update'].includes(operation)
            }
        )

        // all unique columns
        const unique_column_groups = [
            get_primary_keys(table, orma_schema),
            ...get_unique_column_groups(table, false, orma_schema)
        ]

        // generate a where clause for each unique column group for each mutation piece
        const wheres = unique_column_groups.flatMap(unique_columns => {
            const checkable_piece_indices = get_checkable_mutation_indices(
                unique_columns,
                mutation_pieces,
                searchable_piece_indices,
                true
            )

            const where = get_identifying_where(
                orma_schema,
                guid_map,
                mutation_pieces,
                checkable_piece_indices,
                // allow searching if only part of the unique key is present
                (_, { record }) =>
                    unique_columns.filter(
                        column =>
                            record[column] !== undefined &&
                            !is_simple_object(record[column]) &&
                            !Array.isArray(record[column])
                    )
            )
            return where
        })

        const $where = combine_wheres(wheres, '$or')

        if (!$where) {
            return acc
        }

        // add relevant columns
        acc[table] = unique_column_groups.flat().reduce(
            (acc, column) => {
                acc[column] = true
                return acc
            },
            {
                $where
            }
        )

        return acc
    }, {})

    return query
}

const get_checkable_mutation_indices = (
    unique_key: string[],
    mutation_pieces: MutationPiece[],
    piece_indices: number[],
    allow_some_undefined: boolean
) => {
    return piece_indices.filter(piece_index => {
        const { record } = mutation_pieces[piece_index]

        // unique checks done make sense for deletes
        const is_relevant_operation = ['create', 'update'].includes(
            record.$operation
        )

        // identifying keys are not actually being edited (for updates) so we dont want to
        // search for them
        const is_identifying_key =
            record.$operation === 'update' &&
            array_set_equals(record.$identifying_columns, unique_key)

        // null columns never violate unique constraints since null != null in sql. so
        // if even one column is being set to null, the unique constraint cannot be violated and
        // we can ignore the whole thing
        const has_null_value = unique_key.some(column => record[column] === null)

        // for querying, if one column is undefined or an object (which is considered undefined),
        // we still query it because changing even part of a combo unique constraint can cause a
        // constraint violation. But for the actual check once we have all the data in scope, we ignore
        // such records, since we only care about the database returned records that have all the columns
        // present, not the original mutation record that only has some columns filled out.
        //
        // Object values are also ignored and treated like undefined. Although some objects
        // (e.g. $guids ) could cause unique constraint violations, theres no easy way to check
        // if these will cause a constraint violation so we let it fall back to an
        // sql error for now
        const undefined_check_function = allow_some_undefined ? 'every' : 'some'

        const undefined_or_object = unique_key[undefined_check_function](
            column =>
                record[column] === undefined ||
                Array.isArray(record[column]) ||
                is_simple_object(record[column])
        )

        return (
            is_relevant_operation &&
            !is_identifying_key &&
            !has_null_value &&
            !undefined_or_object
        )
    })
}

/**
 * Given the data from {@link get_verify_uniqueness_query}, generates errors for all records in the mutation
 * that have uniqueness conflicts with records from the database
 */
export const get_database_uniqueness_errors = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[],
    piece_indices_by_table: Record<string, number[]>,
    database_records_by_table: Record<string, Record<string, any>[]>
) => {
    const database_tables = Object.keys(database_records_by_table)

    const errors = database_tables.flatMap(table => {
        // a column group is a set of columns that together are unique
        const column_groups = [
            get_primary_keys(table, orma_schema),
            ...get_unique_column_groups(table, false, orma_schema)
        ]

        const table_errors = column_groups.flatMap(column_group => {
            const database_records = database_records_by_table[table]

            const checkable_piece_indices = get_checkable_mutation_indices(
                column_group,
                mutation_pieces,
                piece_indices_by_table[table],
                false
            )

            const mutation_records = checkable_piece_indices.map(
                piece_index => mutation_pieces[piece_index].record
            )

            const database_duplicate_indices = get_duplicate_record_indices(
                database_records,
                mutation_records,
                column_group
            ).filter(([database_index, mutation_index]) => {
                // noop updates happen when a unique column is being set to the value that it already is
                // in the database. A naive check will see a duplicate, since the value in the mutation is
                // in the database. But since they are really the same record, we want to ignore them.
                const database_record = database_records[database_index]
                const mutation_record = mutation_records[mutation_index]

                const is_update = mutation_record.$operation === 'update'
                const is_same_record =
                    mutation_record?.$identifying_columns?.every(
                        column =>
                            database_record[column] == mutation_record[column]
                    )

                const is_noop_update = is_update && is_same_record
                return !is_noop_update
            })

            const database_duplicate_errors = database_duplicate_indices.map(
                ([database_record_index, mutation_record_index]) => {
                    const database_record =
                        database_records[database_record_index]
                    const mutation_piece =
                        mutation_pieces[
                            checkable_piece_indices[mutation_record_index]
                        ]

                    const values = column_group.map(el => database_record[el])

                    const error: OrmaError = {
                        message: `Record is not unique. Columns ${column_group
                            .map(el => JSON.stringify(el))
                            .join(', ')} must be unique but values ${values
                            .map(el => JSON.stringify(el))
                            .join(', ')} are already in the database.`,
                        path: mutation_piece.path,
                        additional_info: {
                            database_record: database_record,
                            mutation_record: mutation_piece.record,
                            unique_columns: column_group,
                            incorrect_values: values
                        }
                    }

                    return error
                }
            )

            return database_duplicate_errors
        })

        return table_errors
    })

    return errors
}

/**
 * Generates errors for records in the mutation that have uniqueness conflicts with other records in the mutation
 */
export const get_mutation_uniqueness_errors = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[],
    piece_indices_by_table: Record<string, number[]>
) => {
    const tables = Object.keys(piece_indices_by_table)

    const errors = tables.flatMap(table => {
        const column_groups = [
            get_primary_keys(table, orma_schema),
            ...get_unique_column_groups(table, false, orma_schema)
        ]

        const table_errors = column_groups.flatMap((column_group: any) => {
            const checkable_piece_indices = get_checkable_mutation_indices(
                column_group,
                mutation_pieces,
                piece_indices_by_table[table],
                false
            )

            const relevant_records = checkable_piece_indices.map(
                piece_index => mutation_pieces[piece_index].record
            )

            const duplicate_indices = get_duplicate_record_indices(
                relevant_records,
                relevant_records,
                column_group
            )

            // we get false positives since a record always matches itself, so basically every record is picked up as a duplicate
            // to prevent this we need to filter out all the entries with only 1 duplicate
            const real_duplicate_indices = duplicate_indices.filter(
                ([i1, i2]) => i1 !== i2
            )

            const duplicate_errors = real_duplicate_indices.flatMap(
                ([record_index1, record_index2]) => {
                    const piece1 =
                        mutation_pieces[checkable_piece_indices[record_index1]]

                    const piece2 =
                        mutation_pieces[checkable_piece_indices[record_index2]]

                    const values = column_group.map(el => piece1.record[el])

                    const errors: OrmaError[] = [piece1, piece2].map(record => {
                        return {
                            message: `Record is not unique. Columns ${column_group
                                .map(el => JSON.stringify(el))
                                .join(', ')} must be unique but values ${values
                                .map(el => JSON.stringify(el))
                                .join(', ')} appear twice in the request.`,
                            path: record.path,
                            additional_info: {
                                mutation_record: record.record,
                                unique_columns: column_group,
                                incorrect_values: values
                            }
                        }
                    })

                    return errors
                }
            )

            return duplicate_errors
        })

        return table_errors
    })

    return errors
}

/**
 * Takes two lists of records and returns the indices of records that are in both lists. A record is considered
 * equal if all the columns in the given identifying_columns array are the same for both records
 */
export const get_duplicate_record_indices = (
    records1: Record<string, any>[],
    records2: Record<string, any>[],
    identifying_columns: string[]
) => {
    const records_to_indices_with_columns = (records: Record<string, any>[]) =>
        records
            .map((el, i) => i)
            .filter(i =>
                identifying_columns.every(
                    column => records[i][column] !== undefined
                )
            )

    const records1_indices = records_to_indices_with_columns(records1)

    // create an index of records by their identifying values. This allows fast lookups for duplicates
    const records1_indices_by_value = key_by(records1_indices, index => {
        const record1 = records1[index]
        const values = identifying_columns.map(column => record1[column])
        return JSON.stringify(values)
    })

    const records2_indices = records_to_indices_with_columns(records2)

    const duplicates = records2_indices.flatMap(record2_index => {
        const record2 = records2[record2_index]
        const values = identifying_columns.map(column => record2[column])
        const values_string = JSON.stringify(values)
        const record1_index = records1_indices_by_value[values_string]

        if (
            record1_index !== undefined &&
            // nulls never make unique constraint violations, so we ignore them
            values.every(value => value !== null)
        ) {
            return [[record1_index, record2_index]]
        } else {
            return []
        }
    })

    return duplicates
}
