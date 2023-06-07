import { group_by } from '../../helpers/helpers'
import { orma_query } from '../../query/query'
import { Path } from '../../types'
import { OrmaSchema } from '../../types/schema/schema_types'
import { sort_database_rows } from '../database_results/sort_database_rows'
import { path_to_entity } from '../helpers/mutate_helpers'
import { get_identifying_where } from '../helpers/record_searching'
import { MutationOperation, MysqlFunction } from '../mutate'
import { MutationPiece as MutationPieceNoUpsert } from '../plan/mutation_batches'
import { GuidMap } from './guid_plan_macro'

export const apply_upsert_macro = async (
    orma_schema: OrmaSchema,
    mysql_function: MysqlFunction,
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[]
) => {
    const query = get_upsert_macro_query(orma_schema, guid_map, mutation_pieces)
    const results = await orma_query(query, orma_schema, mysql_function)
    apply_upsert_macro_given_data(
        orma_schema,
        guid_map,
        mutation_pieces,
        results
    )
}

export const get_upsert_macro_query = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[]
) => {
    const { relevant_piece_indices, select_fields_by_entity } =
        get_upsert_query_data(orma_schema, guid_map, mutation_pieces)

    const piece_indices_by_entity = group_by(
        [...relevant_piece_indices],
        piece_index => path_to_entity(mutation_pieces[piece_index].path)
    )

    const query = Object.entries(piece_indices_by_entity).reduce(
        (acc, [entity, piece_indices], piece_index) => {
            acc[entity] = {
                ...select_fields_by_entity[entity],
                $where: get_identifying_where(
                    orma_schema,
                    guid_map,
                    mutation_pieces,
                    piece_indices
                ),
            }

            return acc
        },
        {} as Record<string, any>
    )

    return query
}

const get_upsert_query_data = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[]
) => {
    const relevant_piece_indices = new Set<number>()
    const select_fields_by_entity: SelectFieldsByEntity = {}
    mutation_pieces.forEach((mutation_piece, piece_index) => {
        if (mutation_piece.record.$operation === 'upsert') {
            add_relevant_piece_index(
                orma_schema,
                guid_map,
                mutation_pieces,
                piece_index,
                relevant_piece_indices,
                select_fields_by_entity
            )
        }
    })

    return { relevant_piece_indices, select_fields_by_entity }
}

const add_relevant_piece_index = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[],
    mutation_piece_index: number,
    relevant_piece_indices: Set<number>,
    query: SelectFieldsByEntity
) => {
    const { record, path } = mutation_pieces[mutation_piece_index]

    relevant_piece_indices.add(mutation_piece_index)
    const entity = path_to_entity(path)
    if (!query[entity]) {
        query[entity] = {}
    }
    record.$identifying_fields?.forEach(field => (query[entity][field] = true))

    // for lookup purposes, if any of the identifying fields are $read guids, then we have to include the mutation
    // piece with the corresponding $write guid in the mutation.
    record.$identifying_fields?.forEach(read_field => {
        const value = record[read_field]
        const has_guid = value?.$guid !== undefined
        if (has_guid && value?.$read) {
            const { piece_index, field: write_field } = guid_map.get(
                value.$guid
            )!.write
            const write_piece = mutation_pieces[piece_index]
            const write_entity = path_to_entity(write_piece.path)
            if (!query[write_entity]) {
                query[write_entity] = {}
            }
            query[write_entity][write_field] = true
            add_relevant_piece_index(
                orma_schema,
                guid_map,
                mutation_pieces,
                piece_index,
                relevant_piece_indices,
                query
            )
        }
    })
}

// const add_to_upsert_query = (
//     orma_schema: OrmaSchema,
//     guid_map: GuidMap,
//     mutation_pieces: MutationPiece[],
//     mutation_piece_index: number,
//     query: Record<string, any>,
//     add_where: boolean
// ) => {
//     const { path, record } = mutation_pieces[mutation_piece_index]
//     const entity = path_to_entity(path)

//     if (!query[entity]) {
//         query[entity] = {}
//     }

//     record.$identifying_fields?.forEach(key => (query[entity][key] = true))

//     if (add_where) {
//         const where = generate_identifying_where(
//             orma_schema,
//             guid_map,
//             mutation_pieces as MutationPieceNoUpsert[],
//             record.$identifying_fields,
//             mutation_piece_index
//         )
//         query[entity].$where = combine_wheres(
//             [query[entity].$where, where],
//             '$or'
//         )
//     }

//     // add any $write guids to the query, that are not already added
//     record.$identifying_fields?.forEach(read_field => {
//         const value = record[read_field]
//         const has_guid = value?.$guid !== undefined
//         if (has_guid && value?.$read) {
//             const { piece_index, field: write_field } = guid_map.get(
//                 value.$guid
//             )!.write
//             const write_piece = mutation_pieces[piece_index]
//             const write_entity = path_to_entity(write_piece.path)
//             query[write_entity][write_field] = true

//             const write_database_row = add_to_upsert_query(
//                 orma_schema,
//                 guid_map,
//                 mutation_pieces,
//                 piece_index,
//                 query,
//                 // if the operation is an upsert, then it already has a where so we dont add it
//                 // again. Otherwise, this record would not be searched for so we need to
//                 // add the where
//                 write_piece.record.$operation !== 'upsert'
//             )
//             const resolved_value = write_database_row?.[write_field]

//             return resolved_value
//         }
//     })
// }

const apply_upsert_macro_given_data = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[],
    results: Record<string, any>
) => {
    const entities = Object.keys(results)
    const sorted_database_rows = sort_database_rows(
        mutation_pieces as MutationPieceNoUpsert[],
        guid_map,
        { start_index: 0, end_index: mutation_pieces.length },
        entities,
        entities.map(entity => results[entity] ?? []),
        orma_schema
    )
    mutation_pieces.forEach((mutation_piece, i) => {
        if (mutation_piece.record.$operation !== 'upsert') {
            return
        }

        const database_row = sorted_database_rows[i]
        if (database_row && Object.keys(database_row).length) {
            //@ts-ignore ts bug, we dont want to type narrow operation to an upsert
            mutation_piece.record.$operation = 'update'
        } else {
            //@ts-ignore
            mutation_piece.record.$operation = 'create'
        }
    })
}

type MutationPiece = {
    record: Record<string, any> &
        (
            | {
                  $operation: 'upsert'
                  $identifying_fields: string[]
              }
            | {
                  $operation: MutationOperation
              }
        )
    path: Path
}

type SelectFieldsByEntity = {
    [Entity: string]: { [Field: string]: true }
}
