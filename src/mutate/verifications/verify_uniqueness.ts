import { OrmaError } from '../../helpers/error_handling'
import {
    array_equals,
    group_by,
    is_simple_object,
    key_by,
} from '../../helpers/helpers'
import {
    get_primary_keys,
    get_unique_field_groups,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../types/schema/schema_types'
import { orma_query } from '../../query/query'
import { combine_wheres } from '../../query/query_helpers'
import { path_to_entity } from '../helpers/mutate_helpers'
import { MysqlFunction } from '../mutate'
import { MutationPiece, MutationPlan } from '../plan/mutation_batches'
import {
    generate_identifying_where,
    get_identifying_query_for_prefetch,
} from '../helpers/record_searching'
import { GuidMap } from '../macros/guid_plan_macro'

/**
 * Generates errors when unique fields are duplicates in two cases:
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

    break up mutation by entity name (keeping track of paths)
    construct a query which searches for all update and delete records in the database
    for each entity name and each column, 
        check for no duplicates in the mutation
        check for no duplicates between mutation and database
    */

    const piece_indices_by_entity = group_by(
        mutation_plan.mutation_pieces.map((_, i) => i),
        piece_index =>
            path_to_entity(mutation_plan.mutation_pieces[piece_index].path)
    )

    const query = get_verify_uniqueness_query(
        orma_schema,
        mutation_plan,
        piece_indices_by_entity
    )

    const results = await orma_query(query, orma_schema, mysql_function)

    const database_errors = get_database_uniqueness_errors(
        orma_schema,
        mutation_plan.mutation_pieces,
        piece_indices_by_entity,
        results
    )
    const mutation_errors = get_mutation_uniqueness_errors(
        orma_schema,
        mutation_plan.mutation_pieces,
        piece_indices_by_entity
    )

    return [...database_errors, ...mutation_errors]
}

/**
 * Gets a query which gets all relevant records from the database needed to do uniqueness checks.
 * Each record is uniquely identified by some combination of fields (e.g. primary key or combo unique fields).
 * The generated query will look up these records, selecting all the unique or combo unique fields
 */
export const get_verify_uniqueness_query = (
    orma_schema: OrmaSchema,
    mutation_plan: Pick<MutationPlan, 'mutation_pieces' | 'guid_map'>,
    piece_indices_by_entity: Record<string, number[]>
) => {
    const { mutation_pieces, guid_map } = mutation_plan
    const mutation_entities = Object.keys(piece_indices_by_entity)

    const query = mutation_entities.reduce((acc, entity) => {
        // deleting a record never causes a unique constraint to be violated, so we only check creates and updates
        const searchable_piece_indices = piece_indices_by_entity[entity].filter(
            piece_index => {
                const operation = mutation_pieces[piece_index].record.$operation
                return ['create', 'update'].includes(operation)
            }
        )

        // all unique fields
        const unique_keys = [
            get_primary_keys(entity, orma_schema),
            ...get_unique_field_groups(entity, false, orma_schema),
        ]

        const select_fields = unique_keys.flat()

        const entity_query = get_identifying_query_for_prefetch(
            guid_map,
            mutation_pieces,
            searchable_piece_indices,
            entity,
            _ => select_fields,
            ({ record }) => {
                // use partial unique keys, since changing part of a unique key can still
                // cause a unique constraint violation
                const relevant_unique_fields = unique_keys
                    .map(unique_key =>
                        unique_key.filter(
                            field =>
                                record[field] !== undefined &&
                                !is_simple_object(record[field]) &&
                                !Array.isArray(record[field])
                        )
                    )
                    .filter(
                        key =>
                            key.length > 0 &&
                            !array_equals(key, record.$identifying_fields ?? [])
                    )

                return relevant_unique_fields
            }
        )

        if (!entity_query?.$where) {
            return acc
        }

        acc[entity] = entity_query
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

        // identifying keys are not actually being edited (for updates) so we dont want to
        // search for them
        const is_identifying_key =
            record.$operation === 'update' &&
            array_equals(record.$identifying_fields, unique_key)

        // null fields never violate unique constraints since null != null in sql. so
        // if even one field is being set to null, the unique constraint cannot be violated and
        // we can ignore the whole thing
        const has_null_value = unique_key.some(field => record[field] === null)

        // for querying, if one field is undefined or an object (which is considered undefined),
        // we still query it because changing even part of a combo unique constraint can cause a
        // constraint violation. But for the actual check once we have all the data in scope, we ignore
        // such records, since we only care about the database returned records that have all the fields
        // present, not the original mutation record that only has some fields filled out
        const undefined_check_function = allow_some_undefined ? 'every' : 'some'

        const all_undefined = unique_key[undefined_check_function](
            field => record[field] === undefined
        )

        // Object values are ignored and treated like undefined. Although some objects
        // (e.g. $guids ) could cause unique constraint violations, theres no easy way to check
        // if these will cause a constraint violation so we let it fall back to an
        // sql error for now
        const has_object_value = unique_key[undefined_check_function](
            field =>
                Array.isArray(record[field]) || is_simple_object(record[field])
        )

        return (
            !is_identifying_key &&
            !has_object_value &&
            !has_null_value &&
            !all_undefined
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
    piece_indices_by_entity: Record<string, number[]>,
    database_records_by_entity: Record<string, Record<string, any>[]>
) => {
    const database_entities = Object.keys(database_records_by_entity)

    const errors = database_entities.flatMap(entity => {
        // a field group is a set of fields that together are unique
        const field_groups = [
            get_primary_keys(entity, orma_schema),
            ...get_unique_field_groups(entity, false, orma_schema),
        ]

        const entity_errors = field_groups.flatMap(field_group => {
            const database_records = database_records_by_entity[entity]

            const checkable_piece_indices = get_checkable_mutation_indices(
                field_group,
                mutation_pieces,
                piece_indices_by_entity[entity],
                false
            )

            const mutation_records = checkable_piece_indices.map(
                piece_index => mutation_pieces[piece_index].record
            )

            const database_duplicate_indices = get_duplicate_record_indices(
                database_records,
                mutation_records,
                field_group
            )

            const database_duplicate_errors = database_duplicate_indices.map(
                ([database_record_index, mutation_record_index]) => {
                    const database_record =
                        database_records[database_record_index]
                    const mutation_piece =
                        mutation_pieces[
                            checkable_piece_indices[mutation_record_index]
                        ]

                    const values = field_group.map(el => database_record[el])

                    const error: OrmaError = {
                        message: `Record is not unique. Fields ${field_group
                            .map(el => JSON.stringify(el))
                            .join(', ')} must be unique but values ${values
                            .map(el => JSON.stringify(el))
                            .join(', ')} are already in the database.`,
                        path: mutation_piece.path,
                        additional_info: {
                            database_record: database_record,
                            mutation_record: mutation_piece.record,
                            unique_fields: field_group,
                            incorrect_values: values,
                        },
                    }

                    return error
                }
            )

            return database_duplicate_errors
        })

        return entity_errors
    })

    return errors
}

/**
 * Generates errors for records in the mutation that have uniqueness conflicts with other records in the mutation
 */
export const get_mutation_uniqueness_errors = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[],
    piece_indices_by_entity: Record<string, number[]>
) => {
    const entities = Object.keys(piece_indices_by_entity)

    const errors = entities.flatMap(entity => {
        const field_groups = [
            get_primary_keys(entity, orma_schema),
            ...get_unique_field_groups(entity, false, orma_schema),
        ]

        const entity_errors = field_groups.flatMap((field_group: any) => {
            const checkable_piece_indices = get_checkable_mutation_indices(
                field_group,
                mutation_pieces,
                piece_indices_by_entity[entity],
                false
            )

            const relevant_records = checkable_piece_indices.map(
                piece_index => mutation_pieces[piece_index].record
            )

            const duplicate_indices = get_duplicate_record_indices(
                relevant_records,
                relevant_records,
                field_group
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

                    const values = field_group.map(el => piece1.record[el])

                    const errors: OrmaError[] = [piece1, piece2].map(record => {
                        return {
                            message: `Record is not unique. Fields ${field_group
                                .map(el => JSON.stringify(el))
                                .join(', ')} must be unique but values ${values
                                .map(el => JSON.stringify(el))
                                .join(', ')} appear twice in the request.`,
                            path: record.path,
                            additional_info: {
                                mutation_record: record.record,
                                unique_fields: field_group,
                                incorrect_values: values,
                            },
                        }
                    })

                    return errors
                }
            )

            return duplicate_errors
        })

        return entity_errors
    })

    return errors
}

/**
 * Takes two lists of records and returns the indices of records that are in both lists. A record is considered
 * equal if all the fields in the given identifying_fields array are the same for both records
 */
export const get_duplicate_record_indices = (
    records1: Record<string, any>[],
    records2: Record<string, any>[],
    identifying_fields: string[]
) => {
    const records_to_indices_with_fields = (records: Record<string, any>[]) =>
        records
            .map((el, i) => i)
            .filter(i =>
                identifying_fields.every(
                    field => records[i][field] !== undefined
                )
            )

    const records1_indices = records_to_indices_with_fields(records1)

    // create an index of records by their identifying values. This allows fast lookups for duplicates
    const records1_indices_by_value = key_by(records1_indices, index => {
        const record1 = records1[index]
        const values = identifying_fields.map(field => record1[field])
        return JSON.stringify(values)
    })

    const records2_indices = records_to_indices_with_fields(records2)

    const duplicates = records2_indices.flatMap(record2_index => {
        const record2 = records2[record2_index]
        const values = identifying_fields.map(field => record2[field])
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
