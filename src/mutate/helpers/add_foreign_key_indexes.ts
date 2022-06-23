import { array_equals, deep_get, key_by, last } from '../../helpers/helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { throw_identifying_key_errors } from '../macros/operation_macros'
import {
    path_to_entity,
    ValuesByGuid,
} from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'
import { get_identifying_keys, get_possible_identifying_keys } from './identifying_keys'

/**
 * This function is used to index database records (e.g. containing foreign keys) by mutation paths. Specifically,
 * given a list of statements and results for those statements, generates an object where the keys are all the paths
 * contained in the statements and the values are the database rows matched with those paths. Matching paths with
 * database rows is done by checking equality with the values of the identifying keys gotten from
 * {@link get_identifying_keys}. Note that query results[i] should contain the results of all the paths in
 * planned_statements[i].paths.
 * Operates on one table at a time
 * Parallel arrays for planned_statements and query_results
 */
export const add_foreign_key_indexes = (
    planned_statements: {
        paths: (string | number)[][] // into the mutation
        route: string[]
    }[],
    query_results: Record<string, any>[][], // left list
    mutation: any, //right list
    orma_schema: OrmaSchema
) => {
    const db_row_by_path = {}
    if (query_results.length !== planned_statements.length) {
        throw new Error(
            'Mysql function should return one array of rows per planned statement'
        )
    }

    planned_statements.forEach((planned_statement, i) => {
        const database_rows = query_results[i]
        const entity_name = last(planned_statement.route)
        const mutation_rows = planned_statement.paths.map(path =>
            deep_get(path, mutation, undefined)
        )

        // - we get a list of identifying keys for the mutation rows
        // - for each identifying key, we index the database rows by that key (so we end up with one
        //   index per key).
        // - we use these indexes to match database rows with mutation rows
        const unique_keys_set = new Set<string>()
        mutation_rows.forEach((mutation_row, i) => {
            const identifying_keys = get_identifying_keys(
                entity_name,
                mutation_row,
                orma_schema,
                mutation_row.$operation === 'create'
            )

            if (mutation_row.$operation !== 'create') {
                throw_identifying_key_errors(
                    mutation_row.$operation,
                    identifying_keys,
                    planned_statement.paths[i]
                )
            }

            unique_keys_set.add(JSON.stringify(identifying_keys))
        })
        const all_identifying_keys: string[][] = [...unique_keys_set].map(el =>
            JSON.parse(el)
        )

        const database_row_indexes = all_identifying_keys.map(unique_key => {
            const index = key_by(database_rows, db_row =>
                // we chose the unique key such that none of its fields are nullable, and they are all actually
                // supplied in the mutation. Therefore we can safely stringify without worrying about null values getting
                // lost, or collisions between two rows that both have null fields (mysql allows this on unique indexes)
                JSON.stringify(unique_key.map(field => db_row[field]))
            )
            return index
        })

        // we order these so that ordered_database_rows[i] has the foreign keys of mutation_rows[i]
        const ordered_database_rows = mutation_rows.map(mutation_row => {
            // TODO: make all these get_identifying_leys calls more efficient by caching them
            const identifying_keys = get_identifying_keys(
                entity_name,
                mutation_row,
                orma_schema,
                mutation_row.$operation === 'create'
            )
            const identifying_key_index = all_identifying_keys.findIndex(keys =>
                array_equals(keys, identifying_keys)
            )
            const database_row_index =
                database_row_indexes[identifying_key_index]
            const identifying_values = identifying_keys.map(
                key => mutation_row[key]
            )
            const database_row =
                database_row_index[JSON.stringify(identifying_values)]

            if (!database_row) {
                throw new Error(
                    `Could not find database row for mutation row with keys ${identifying_keys} and values ${identifying_values}`
                )
            }
            return database_row
        })

        ordered_database_rows.forEach((database_row, i) => {
            // paths is aligned with mutation_rows which is aligned with ordered_database_rows, which is why this
            // is justified
            const path = planned_statement.paths[i]
            db_row_by_path[JSON.stringify(path)] = database_row
        })
    })

    return db_row_by_path
}

type DatabaseIndexesByEntity = {
    [Entity: string]: {
        [stringified_values: string]: Record<string, any>
    }[]
}

export const sort_database_rows = (
    mutation_pieces: MutationPiece[],
    queries: Record<string, any>[],
    query_results: Record<string, any>[][],
    orma_schema: OrmaSchema
) => {
    if (query_results.length !== queries.length) {
        throw new Error(
            'Mysql function should return one array of rows per query'
        )
    }

    const database_indexes_by_entity = get_database_indexes_by_entity(
        queries,
        query_results,
        orma_schema
    )

    const sorted_database_rows = sort_database_rows_given_indexes(
        mutation_pieces,
        database_indexes_by_entity,
        orma_schema
    )

    return sorted_database_rows
}

const get_database_indexes_by_entity = (
    queries: Record<string, any>[],
    query_results: Record<string, any>[][],
    orma_schema: OrmaSchema
) => {
    const database_indexes_by_entity = queries.reduce<DatabaseIndexesByEntity>(
        (acc, query, query_index) => {
            const entity = query.$from
            const possible_identifying_keys = get_possible_identifying_keys(
                entity,
                orma_schema
            )
            const database_rows = query_results[query_index]
            const database_row_indexes = possible_identifying_keys.map(
                identifying_key => {
                    const index = key_by(database_rows, db_row =>
                        // we chose the unique key such that none of its fields are nullable, and they are all actually
                        // supplied in the mutation. Therefore we can safely stringify without worrying about null values getting
                        // lost, or collisions between two rows that both have null fields (mysql allows this on unique indexes)
                        JSON.stringify(
                            identifying_key.map(field => db_row[field])
                        )
                    )
                    return index
                }
            )

            if (acc[entity] === undefined) {
                acc[entity] = []
            }
            acc[entity].push(...database_row_indexes)
            return acc
        },
        {}
    )

    return database_indexes_by_entity
}

const sort_database_rows_given_indexes = (
    mutation_pieces: MutationPiece[],
    database_indexes_by_entity: DatabaseIndexesByEntity,
    orma_schema: OrmaSchema
) => {
    const ordered_database_rows = mutation_pieces.map(({ record, path }) => {
        const entity = path_to_entity(path)

        const identifying_keys = get_identifying_keys(
            entity,
            record,
            orma_schema,
            true // we dont mind if the unique key is ambiguous, since the choice of key doesnt do anything
            // (unlike in an actual update, where it determines which fields are modified). We just select any key in
            // the same way as was selected for the query
        )
        const possible_identifying_keys = get_possible_identifying_keys(
            entity,
            orma_schema
        )
        const identifying_key_index = possible_identifying_keys.findIndex(
            keys => array_equals(keys, identifying_keys)
        )

        const database_index =
            database_indexes_by_entity[entity][identifying_key_index]
        const database_row =
            database_index[
                JSON.stringify(identifying_keys.map(field => record[field]))
            ] ?? {}

        // if (!database_row) {
        //     throw new Error(
        //         `Could not find database row for mutation row with keys ${identifying_keys} and values ${identifying_values}`
        //     )
        // }

        return database_row
    })

    return ordered_database_rows
}

/**
 * Saves guid values into the provided index. Database rows should be in the same order as the mutation rows.
 * Will mutate the input values_by_guid
 */
export const save_guids = (
    values_by_guid: ValuesByGuid,
    mutation_pieces: MutationPiece[],
    sorted_database_rows: Record<string, any>[]
) => {
    mutation_pieces.forEach((mutation_piece, mutation_piece_index) => {
        Object.keys(mutation_piece).forEach(field => {
            const guid = mutation_piece.record[field]?.$guid
            const db_value = sorted_database_rows[mutation_piece_index][field]

            if (guid !== undefined && db_value !== undefined) {
                values_by_guid[guid] = db_value
            }
        })
    })
}
