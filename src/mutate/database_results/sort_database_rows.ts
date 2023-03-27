import { array_equals, key_by } from '../../helpers/helpers'
import { OrmaSchema } from '../../types/schema/schema_types'
import { path_to_entity } from '../helpers/mutate_helpers'
import { GuidMap } from '../macros/guid_plan_macro'
import {
    get_identifying_fields,
    get_possible_identifying_keys,
} from '../macros/identifying_fields_macro'
import {
    MutationBatch,
    MutationPiece,
    mutation_batch_for_each,
} from '../plan/mutation_batches'

type DatabaseIndexesByEntity = {
    [Entity: string]: {
        [stringified_values: string]: Record<string, any>
    }[]
}

export const sort_database_rows = (
    mutation_pieces: MutationPiece[],
    guid_map: GuidMap,
    mutation_batch: MutationBatch | number[],
    query_entities: string[],
    query_results: Record<string, any>[][],
    orma_schema: OrmaSchema
) => {
    if (query_results.length !== query_entities.length) {
        throw new Error(
            'Mysql function should return one array of rows per query'
        )
    }

    const database_indexes_by_entity = get_database_indexes_by_entity(
        query_entities,
        query_results,
        orma_schema
    )

    const sorted_database_rows = sort_database_rows_given_indexes(
        mutation_pieces,
        guid_map,
        mutation_batch,
        database_indexes_by_entity,
        orma_schema
    )

    return sorted_database_rows
}

const get_database_indexes_by_entity = (
    query_entities: string[],
    query_results: Record<string, any>[][],
    orma_schema: OrmaSchema
) => {
    const database_indexes_by_entity =
        query_entities.reduce<DatabaseIndexesByEntity>(
            (acc, entity, query_index) => {
                const possible_identifying_keys = get_possible_identifying_keys(
                    orma_schema,
                    entity
                )
                const database_rows = query_results[query_index]
                const database_row_indexes = possible_identifying_keys.map(
                    identifying_key => {
                        const relevant_database_rows = database_rows.filter(
                            row =>
                                identifying_key.every(
                                    key => row[key] !== undefined
                                )
                        )
                        const index = key_by(relevant_database_rows, db_row =>
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
    guid_map: GuidMap,
    mutation_batch: MutationBatch | number[],
    database_indexes_by_entity: DatabaseIndexesByEntity,
    orma_schema: OrmaSchema
) => {
    let ordered_database_rows: (Record<string, any> | undefined)[] = []
    mutation_batch_for_each(
        mutation_pieces,
        mutation_batch,
        ({ record, path }, mutation_piece_index) => {
            const database_row = get_database_row_for_mutation_piece(
                mutation_pieces,
                guid_map,
                database_indexes_by_entity,
                orma_schema,
                mutation_piece_index
            )
            ordered_database_rows.push(database_row)
        }
    )

    return ordered_database_rows
}

const get_database_row_for_mutation_piece = (
    mutation_pieces: MutationPiece[],
    guid_map: GuidMap,
    database_indexes_by_entity: DatabaseIndexesByEntity,
    orma_schema: OrmaSchema,
    mutation_piece_index: number
) => {
    const { record, path } = mutation_pieces[mutation_piece_index]
    const entity = path_to_entity(path)

    // this can happen if all data is provided by the user so there is no query to get more data about this record
    if (!database_indexes_by_entity[entity]) {
        return undefined
    }

    const identifying_keys = get_identifying_fields(
        orma_schema,
        entity,
        record,
        true // we dont mind if the unique key is ambiguous, since the choice of key doesnt do anything
        // (unlike in an actual update, where it determines which fields are modified). We just select any key in
        // the same way as was selected for the query
    )
    const possible_identifying_keys = get_possible_identifying_keys(
        orma_schema,
        entity
    )
    const identifying_key_index = possible_identifying_keys.findIndex(keys =>
        array_equals(keys, identifying_keys)
    )

    const identifying_values = identifying_keys.map(field => {
        const value = record[field]

        const has_guid = value?.$guid !== undefined
        if (has_guid && value?.$read) {
            const { piece_index, field } = guid_map.get(value.$guid)!.write
            const write_database_row = get_database_row_for_mutation_piece(
                mutation_pieces,
                guid_map,
                database_indexes_by_entity,
                orma_schema,
                piece_index
            )
            const resolved_value = write_database_row?.[field]

            return resolved_value
        } else {
            return value
        }
    })

    const database_index =
        database_indexes_by_entity[entity][identifying_key_index]
    const database_row =
        database_index[JSON.stringify(identifying_values)] ?? {}

    return database_row
}
