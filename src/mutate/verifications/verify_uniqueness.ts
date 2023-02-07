import { OrmaError } from '../../helpers/error_handling'
import { array_equals, group_by, key_by } from '../../helpers/helpers'
import {
    get_primary_keys,
    get_unique_field_groups,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { orma_query } from '../../query/query'
import { combine_wheres } from '../../query/query_helpers'
import { PathedRecord } from '../../types'
import { get_identifying_keys } from '../helpers/identifying_keys'
import { path_to_entity } from '../helpers/mutate_helpers'
import { generate_record_where_clause_from_identifying_keys } from '../helpers/record_searching'
import { MysqlFunction } from '../mutate'
import { MutationPiece, MutationPlan } from '../plan/mutation_plan'

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
    mutation_plan: Pick<MutationPlan, 'mutation_pieces'>
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

    const mutation_pieces_by_entity = group_by(
        mutation_plan.mutation_pieces,
        mutation_piece => path_to_entity(mutation_piece.path)
    )

    const query = get_verify_uniqueness_query(
        orma_schema,
        mutation_pieces_by_entity
    )

    const results = await orma_query(query, orma_schema, mysql_function)

    const database_errors = get_database_uniqueness_errors(
        orma_schema,
        mutation_pieces_by_entity,
        results
    )
    const mutation_errors = get_mutation_uniqueness_errors(
        orma_schema,
        mutation_pieces_by_entity
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
    mutation_pieces_by_entity: Record<string, MutationPiece[]>
) => {
    const mutation_entities = Object.keys(mutation_pieces_by_entity)
    const query = mutation_entities.reduce((acc, entity) => {
        const mutation_pieces = mutation_pieces_by_entity[entity]

        // deleting a record never causes a unique constraint to be violated, so we only check creates and updates
        const searchable_mutation_pieces = mutation_pieces.filter(
            ({ record }) =>
                record.$operation === 'update' || record.$operation === 'create'
        )

        // all unique fields
        const unique_field_groups = [
            get_primary_keys(entity, orma_schema),
            ...get_unique_field_groups(entity, false, orma_schema),
        ]

        // generate a where clause for each unique field group for each mutation piece
        const wheres = searchable_mutation_pieces.flatMap(mutation_piece => {
            const identifying_fields = get_identifying_keys(
                path_to_entity(mutation_piece.path),
                mutation_piece.record,
                {},
                orma_schema,
                true
            )

            return (
                unique_field_groups
                    // identifying keys are not actually being edited (for updates) so we dont want to
                    // search for them
                    .filter(
                        unique_fields =>
                            mutation_piece.record.$operation !== 'update' ||
                            !array_equals(identifying_fields, unique_fields)
                    )
                    .filter(unique_fields =>
                        // null fields never violate unique constraints since null != null in sql. so
                        // if even one field is being set to null, the unique constraint cannot be violated and
                        // we can ignore the whole thing
                        unique_fields.every(
                            field => mutation_piece.record[field] !== null
                        )
                    )
                    .map(unique_fields =>
                        // if all the fields are undefined, the unique constraint is not relevant to this record
                        // so we can ignore it. Otherwise, we must take the fields that are present since changing
                        // even part of a combo unique constraint can cause a violation of the constraint
                        unique_fields.filter(
                            field =>
                                mutation_piece.record[field] !== undefined &&
                                // ignore objects such as sql functions or $guid. These could cause sql errors,
                                // but theres no easy way to check if these will cause a unique constraint violation
                                typeof mutation_piece.record[field] !== 'object'
                        )
                    )
                    .filter(el => el.length > 0)
                    .map(unique_fields =>
                        generate_record_where_clause_from_identifying_keys(
                            {},
                            unique_fields,
                            mutation_piece
                        )
                    )
            )
        })

        const $where = combine_wheres(wheres, '$or')

        if (!$where) {
            return acc
        }

        // add relevant columns
        acc[entity] = unique_field_groups.flat().reduce(
            (acc, field) => {
                acc[field] = true
                return acc
            },
            {
                $where,
            }
        )

        return acc
    }, {})

    return query
}

/**
 * Given the data from {@link get_verify_uniqueness_query}, generates errors for all records in the mutation
 * that have uniqueness conflicts with records from the database
 */
export const get_database_uniqueness_errors = (
    orma_schema: OrmaSchema,
    mutation_pieces_by_entity: Record<string, MutationPiece[]>,
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
            const mutation_pathed_records = mutation_pieces_by_entity[entity]

            const mutation_records = mutation_pathed_records
                .map(({ record }) => record)
                .filter(
                    // dont generate errors for identifying keys on updates, since these are not being modified
                    record =>
                        record.$operation !== 'update' ||
                        !array_equals(
                            get_identifying_keys(
                                entity,
                                record,
                                {},
                                orma_schema,
                                true
                            ),
                            field_group
                        )
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
                    const mutation_pathed_record =
                        mutation_pathed_records[mutation_record_index]

                    const values = field_group.map(el => database_record[el])

                    const error: OrmaError = {
                        message: `Record is not unique. Fields ${field_group
                            .map(el => JSON.stringify(el))
                            .join(', ')} must be unique but values ${values
                            .map(el => JSON.stringify(el))
                            .join(', ')} are already in the database.`,
                        path: mutation_pathed_record.path,
                        additional_info: {
                            database_record: database_record,
                            mutation_record: mutation_pathed_record.record,
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
    mutation_pathed_records_by_entity: Record<string, PathedRecord[]>
) => {
    const entities = Object.keys(mutation_pathed_records_by_entity)

    const errors = entities.flatMap(entity => {
        const field_groups = [
            get_primary_keys(entity, orma_schema),
            ...get_unique_field_groups(entity, false, orma_schema),
        ]

        const entity_errors = field_groups.flatMap((field_group: any) => {
            const pathed_records = mutation_pathed_records_by_entity[entity]
            const records = pathed_records
                .map(({ record }) => record)
                .filter(
                    // dont generate errors for identifying keys on updates, since these are not being modified
                    record =>
                        record.$operation !== 'update' ||
                        !array_equals(
                            get_identifying_keys(
                                entity,
                                record,
                                {},
                                orma_schema,
                                true
                            ),
                            field_group
                        )
                )

            const duplicate_indices = get_duplicate_record_indices(
                records,
                records,
                field_group
            )

            // we get false positives since a record always matches itself, so basically every record is picked up as a duplicate
            // to prevent this we need to filter out all the entries with only 1 duplicate
            const real_duplicate_indices = duplicate_indices.filter(
                ([i1, i2]) => i1 !== i2
            )

            const duplicate_errors = real_duplicate_indices.flatMap(
                ([record_index1, record_index2]) => {
                    const pathed_record1 = pathed_records[record_index1]

                    const pathed_record2 = pathed_records[record_index2]

                    const values = field_group.map(
                        el => pathed_record1.record[el]
                    )

                    const errors: OrmaError[] = [
                        pathed_record1,
                        pathed_record2,
                    ].map(record => {
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
