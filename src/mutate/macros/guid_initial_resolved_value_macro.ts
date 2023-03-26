// import { orma_query } from '../../query/query'
// import { OrmaSchema } from '../../types/schema/schema_types'
// import { sort_database_rows } from '../database_results/sort_database_rows'
// import { path_to_entity } from '../helpers/mutate_helpers'
// import { MysqlFunction } from '../mutate'
// import { MutationPiece } from '../plan/mutation_plan'
// import { GuidMap } from './guid_plan_macro'

// export const apply_guid_initial_value_macro = async (
//     orma_schema: OrmaSchema,
//     mysql_function: MysqlFunction,
//     guid_map: GuidMap,
//     mutation_pieces: MutationPiece[]
// ) => {
//     const piece_indices_by_entity = mutation_pieces.reduce(
//         (acc, piece, piece_index) => {
//             const entity = path_to_entity(piece.path)
//             if (!acc[entity]) {
//                 acc[entity] = []
//             }
//             acc[entity].push(piece_index)
//             return acc
//         },
//         {} as Record<string, number[]>
//     )
//     const query = get_guid_initial_value_query(mutation_pieces, guid_map)
//     const results = await orma_query(query, orma_schema, mysql_function)
//     const sorted_database_rows = sort_database_rows(
//         mutation_pieces,
//         guid_map,
//         { start_index: 0, end_index: mutation_pieces.length },
//         Object.keys(piece_indices_by_entity),
//         query_results,
//         orma_schema
//     )
//     return sorted_database_rows
// }

// /** 
//  * generates a query that finds the initial value of all read guids
// */
// const get_guid_initial_value_query = (
//     orma_schema: OrmaSchema,
//     mysql_function: MysqlFunction,
//     guid_map: GuidMap,
//     mutation_pieces: MutationPiece[],
//     piece_indices_by_entity: Record<string, number[]>
// ) => {
//     const mutation_entities = Object.keys(piece_indices_by_entity)
//     const query = mutation_entities.reduce((acc, entity) => {

//         // deleting a record never causes a unique constraint to be violated, so we only check creates and updates
//         const searchable_piece_indices = piece_indices_by_entity[entity].filter(
//             piece_index => {
//                 const operation = mutation_pieces[piece_index].record.$operation
//                 return ['create', 'update'].includes(operation)
//             }
//         )

//         // all unique fields
//         const unique_field_groups = [
//             get_primary_keys(entity, orma_schema),
//             ...get_unique_field_groups(entity, false, orma_schema),
//         ]

//         // generate a where clause for each unique field group for each mutation piece
//         const wheres = unique_field_groups.flatMap(unique_fields => {
//             const checkable_piece_indices = get_checkable_mutation_indices(
//                 unique_fields,
//                 mutation_pieces,
//                 searchable_piece_indices,
//                 true
//             )

//             return checkable_piece_indices.map(piece_index => {
//                 const { record } = mutation_pieces[piece_index]
//                 const relevant_unique_fields = unique_fields.filter(
//                     field =>
//                         record[field] !== undefined &&
//                         !is_simple_object(record[field]) &&
//                         !Array.isArray(record[field])
//                 )
//                 return generate_identifying_where(
//                     orma_schema,
//                     guid_map,
//                     mutation_pieces,
//                     relevant_unique_fields,
//                     piece_index
//                 )
//             })
//         })

//         const $where = combine_wheres(wheres, '$or')

//         if (!$where) {
//             return acc
//         }

//         // add relevant columns
//         acc[entity] = unique_field_groups.flat().reduce(
//             (acc, field) => {
//                 acc[field] = true
//                 return acc
//             },
//             {
//                 $where,
//             }
//         )

//         return acc
//     }, {})

//     return query
// }
