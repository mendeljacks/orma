import { group_by } from '../../helpers/helpers'
import { orma_query } from '../../query/query'
import { Path } from '../../types'
import { OrmaSchema } from '../../schema/schema_types'
import { sort_database_rows } from '../database_results/sort_database_rows'
import { path_to_table } from '../helpers/mutate_helpers'
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
    if (!query) {
        return
    }
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
    const { relevant_piece_indices, select_columns_by_table } =
        get_upsert_query_data(orma_schema, guid_map, mutation_pieces)

    if (relevant_piece_indices.size === 0) {
        return undefined
    }

    const piece_indices_by_table = group_by(
        [...relevant_piece_indices],
        piece_index => path_to_table(mutation_pieces[piece_index].path)
    )

    const query = Object.entries(piece_indices_by_table).reduce(
        (acc, [table, piece_indices], piece_index) => {
            acc[table] = {
                ...select_columns_by_table[table],
                $where: get_identifying_where(
                    orma_schema,
                    guid_map,
                    mutation_pieces,
                    piece_indices
                )
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
    const select_columns_by_table: SelectColumnsByTable = {}
    mutation_pieces.forEach((mutation_piece, piece_index) => {
        if (mutation_piece.record.$operation === 'upsert') {
            add_relevant_piece_index(
                orma_schema,
                guid_map,
                mutation_pieces,
                piece_index,
                relevant_piece_indices,
                select_columns_by_table
            )
        }
    })

    return { relevant_piece_indices, select_columns_by_table }
}

const add_relevant_piece_index = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[],
    mutation_piece_index: number,
    relevant_piece_indices: Set<number>,
    query: SelectColumnsByTable
) => {
    const { record, path } = mutation_pieces[mutation_piece_index]

    relevant_piece_indices.add(mutation_piece_index)
    const table = path_to_table(path)
    if (!query[table]) {
        query[table] = {}
    }
    record.$identifying_columns?.forEach(column => (query[table][column] = true))

    // for lookup purposes, if any of the identifying columns are $read guids, then we have to include the mutation
    // piece with the corresponding $write guid in the mutation.
    record.$identifying_columns?.forEach(read_column => {
        const value = record[read_column]
        const has_guid = value?.$guid !== undefined
        if (has_guid && value?.$read) {
            const { piece_index, column: write_column } = guid_map.get(
                value.$guid
            )!.write
            const write_piece = mutation_pieces[piece_index]
            const write_table = path_to_table(write_piece.path)
            if (!query[write_table]) {
                query[write_table] = {}
            }
            query[write_table][write_column] = true
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
//     const table = path_to_table(path)

//     if (!query[table]) {
//         query[table] = {}
//     }

//     record.$identifying_columns?.forEach(key => (query[table][key] = true))

//     if (add_where) {
//         const where = generate_identifying_where(
//             orma_schema,
//             guid_map,
//             mutation_pieces as MutationPieceNoUpsert[],
//             record.$identifying_columns,
//             mutation_piece_index
//         )
//         query[table].$where = combine_wheres(
//             [query[table].$where, where],
//             '$or'
//         )
//     }

//     // add any $write guids to the query, that are not already added
//     record.$identifying_columns?.forEach(read_column => {
//         const value = record[read_column]
//         const has_guid = value?.$guid !== undefined
//         if (has_guid && value?.$read) {
//             const { piece_index, column: write_column } = guid_map.get(
//                 value.$guid
//             )!.write
//             const write_piece = mutation_pieces[piece_index]
//             const write_table = path_to_table(write_piece.path)
//             query[write_table][write_column] = true

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
//             const resolved_value = write_database_row?.[write_column]

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
    const tables = Object.keys(results)
    const sorted_database_rows = sort_database_rows(
        mutation_pieces as MutationPieceNoUpsert[],
        guid_map,
        { start_index: 0, end_index: mutation_pieces.length },
        tables,
        tables.map(table => results[table] ?? []),
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
            // identifying columns are only for updates and deletes, not creates
            //@ts-ignore
            delete mutation_piece.record.$identifying_columns
        }
    })
}

type MutationPiece = {
    record: Record<string, any> &
        (
            | {
                  $operation: 'upsert'
                  $identifying_columns: string[]
              }
            | {
                  $operation: MutationOperation
              }
        )
    path: Path
}

type SelectColumnsByTable = {
    [Table: string]: { [Column: string]: true }
}
