import { array_equals, key_by } from '../../helpers/helpers'
import { OrmaSchema } from '../../introspector/introspector'
import {
    get_identifying_keys,
    get_possible_identifying_keys,
} from '../helpers/identifying_keys'
import { path_to_entity } from '../helpers/mutate_helpers'
import { ValuesByGuid } from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'
import { get_resolved_mutation_value } from '../statement_generation/mutation_operations'

type DatabaseIndexesByEntity = {
    [Entity: string]: {
        [stringified_values: string]: Record<string, any>
    }[]
}

export const sort_database_rows = (
    mutation_pieces: MutationPiece[],
    queries: Record<string, any>[],
    query_results: Record<string, any>[][],
    values_by_guid: ValuesByGuid,
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
        values_by_guid,
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
    values_by_guid: ValuesByGuid,
    orma_schema: OrmaSchema
) => {
    const ordered_database_rows = mutation_pieces.map(({ record, path }) => {
        const entity = path_to_entity(path)

        const identifying_keys = get_identifying_keys(
            entity,
            record,
            values_by_guid,
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
                JSON.stringify(
                    identifying_keys.map(field =>
                        get_resolved_mutation_value(
                            record,
                            field,
                            values_by_guid
                        )
                    )
                )
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
