import { OrmaError } from '../../helpers/error_handling'
import { group_by, key_by } from '../../helpers/helpers'
import {
    get_primary_keys,
    get_unique_field_groups,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { get_search_records_where } from '../../query/query_helpers'
import { PathedRecord } from '../../types'
import { get_identifying_keys } from '../helpers/identifying_keys'
import { split_mutation_by_entity } from '../helpers/mutate_helpers'


/**
 * Generates errors when unique fields are duplicates in two cases:
 *   1. records from the mutation conflict with records in the database
 *   2. records from the mutation conflict with other records from the mutation
 *
 * @param orma_query a function which takes an orma query and gives the results of running the query
 * @returns
 */
export const verify_uniqueness = async (
    mutation,
    orma_query: (query) => Promise<any>,
    orma_schema: OrmaSchema
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

    const pathed_records_by_entity = split_mutation_by_entity(mutation)

    const query = get_verify_uniqueness_query(
        pathed_records_by_entity,
        orma_schema
    )

    const results = await orma_query(query)

    const database_errors = get_database_uniqueness_errors(
        pathed_records_by_entity,
        results,
        mutation,
        orma_schema
    )
    const mutation_errors = get_mutation_uniqueness_errors(
        pathed_records_by_entity,
        mutation,
        orma_schema
    )

    return [...database_errors, ...mutation_errors]
}

/**
 * Gets a query which gets all relevant records from the database needed to do uniqueness checks.
 * Each record is uniquely identified by some combination of fields (e.g. primary key or combo unique fields).
 * The generated query will look up these records, selecting all the unique or combo unique fields
 */
export const get_verify_uniqueness_query = (
    pathed_records_by_entity: Record<string, PathedRecord[]>,
    orma_schema: OrmaSchema
) => {
    const mutation_entities = Object.keys(pathed_records_by_entity)
    const query = mutation_entities.reduce((acc, entity) => {
        const pathed_records = pathed_records_by_entity[entity]

        // creates cannot be looked up, since they are not yet in the database
        const searchable_pathed_records = pathed_records.filter(
            ({ record }) =>
                record?.$operation === 'update' ||
                record?.$operation === 'delete'
        )

        // all unique fields
        const search_fields = new Set([
            ...get_primary_keys(entity, orma_schema),
            ...get_unique_field_groups(entity, false, orma_schema).flatMap(
                el => el
            ),
        ])

        // searches all records for the entity
        const $where = get_search_records_where(
            searchable_pathed_records.map(({ record }) => record),
            // TODO: add values_by_guid
            record => get_identifying_keys(entity, record, {}, orma_schema)
        )

        if (!$where) {
            throw new Error(
                'There should be a where clause. Something went wrong.'
            )
        }

        // add this entity to the query
        acc[entity] = [...search_fields].reduce(
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
    mutation_pathed_records_by_entity: Record<string, PathedRecord[]>,
    database_records_by_entity: Record<string, Record<string, any>[]>,
    mutation,
    orma_schema: OrmaSchema
) => {
    const database_entities = Object.keys(database_records_by_entity)

    const errors = database_entities.flatMap(entity => {
        // a field group is a set of fields that together are unique
        const field_groups = [
            get_primary_keys(entity, orma_schema),
            ...get_unique_field_groups(entity, false, orma_schema),
        ]

        const entity_errors = field_groups.flatMap((field_group: any) => {
            const database_records = database_records_by_entity[entity]
            const mutation_pathed_records =
                mutation_pathed_records_by_entity[entity]

            const mutation_records = mutation_pathed_records.map(
                ({ record }) => record
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
                        message: `Record is not unique. Fields ${field_group.join(
                            ', '
                        )} must be unique but values ${values.join(
                            ', '
                        )} are already in the database.`,
                        original_data: mutation,
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
    mutation_pathed_records_by_entity: Record<string, PathedRecord[]>,
    mutation,
    orma_schema: OrmaSchema
) => {
    const entities = Object.keys(mutation_pathed_records_by_entity)

    const errors = entities.flatMap(entity => {
        const field_groups = [
            get_primary_keys(entity, orma_schema),
            ...get_unique_field_groups(entity, false, orma_schema),
        ]

        const entity_errors = field_groups.flatMap((field_group: any) => {
            const pathed_records = mutation_pathed_records_by_entity[entity]
            const records = pathed_records.map(({ record }) => record)

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
                            message: `Record is not unique. Fields ${field_group.join(
                                ', '
                            )} must be unique but values ${values.join(
                                ', '
                            )} appear twice in the request.`,
                            original_data: mutation,
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

    const duplicates = records2_indices
        .map(record2_index => {
            const record2 = records2[record2_index]
            const values = identifying_fields.map(field => record2[field])
            const values_string = JSON.stringify(values)
            const record1_index = records1_indices_by_value[values_string]

            if (record1_index !== undefined) {
                return [record1_index, record2_index]
            } else {
                return undefined
            }
        })
        .filter(el => el !== undefined)

    return duplicates
}
