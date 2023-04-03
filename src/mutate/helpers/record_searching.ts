import { deep_equal } from '../../helpers/helpers'
import { Edge } from '../../helpers/schema_helpers'
import { combine_wheres } from '../../query/query_helpers'
import { OrmaSchema } from '../../types/schema/schema_types'
import { GuidMap } from '../macros/guid_plan_macro'
import { MutationPiece } from '../plan/mutation_batches'
import { path_to_entity } from './mutate_helpers'

/**
 * This function generates the query required to find the specified mutation
 * pieces in the database.
 * During prefetch (i.e. before the mutation runs), guids are not resolved yet so we need
 * to do a database-side search for things that have a guid. The output query uses inner
 * joins for performance reasons.
 */
export const get_identifying_query_for_prefetch = (
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[],
    mutation_piece_indices: number[],
    entity: string,
    get_select_fields: (
        mutation_piece: MutationPiece,
        piece_index: number
    ) => string[],
    get_identifying_keys: (
        mutation_piece: MutationPiece,
        piece_index: number
    ) => string[][]
) => {
    let join_edges: Edge[] = []

    const select_obj = mutation_piece_indices.reduce((acc, piece_index) => {
        const select_fields = get_select_fields(
            mutation_pieces[piece_index],
            piece_index
        )
        select_fields.forEach(field => (acc[field] = true))
        return acc
    }, new Set<string>())

    const ors = mutation_piece_indices.flatMap(piece_index => {
        const identifying_keys = get_identifying_keys(
            mutation_pieces[piece_index],
            piece_index
        )
        const record_wheres = identifying_keys.map(identifying_fields =>
            get_identifying_where_for_prefetch(
                guid_map,
                join_edges,
                mutation_pieces,
                piece_index,
                entity,
                identifying_fields
            )
        )
        return record_wheres
    })

    const $where = combine_wheres(ors, '$or')

    const $inner_join = join_edges.map(edge => ({
        $entity: edge.to_entity,
        $on: {
            $eq: [
                {
                    $entity: edge.from_entity,
                    $field: edge.from_field,
                },
                {
                    $entity: edge.to_entity,
                    $field: edge.to_field,
                },
            ],
        },
    }))

    return {
        ...select_obj,
        $from: entity,
        ...($inner_join.length && { $inner_join }),
        $where,
    }
}

const get_identifying_where_for_prefetch = (
    guid_map: GuidMap,
    join_edges: Edge[],
    mutation_pieces: MutationPiece[],
    piece_index: number,
    entity: string,
    identifying_fields: string[]
) => {
    const { record } = mutation_pieces[piece_index]
    const ands = identifying_fields.map(key => {
        const guid = record[key]?.$guid
        if (guid === undefined) {
            // if there is no guid, we just search the raw value
            return {
                $eq: [
                    { $entity: entity, $field: key },
                    { $escape: record[key] },
                ],
            }
        } else {
            // if there is a guid, we have to search based on where the guid writes from. This allows
            // us to identify records based on a read guid field.
            const write_info = guid_map.get(guid)?.write!
            const write_piece = mutation_pieces[write_info.piece_index]
            const write_entity = path_to_entity(write_piece.path)

            // add the join edge so we know what to inner join later
            const join_edge: Edge = {
                from_entity: entity,
                from_field: key,
                to_entity: write_entity,
                to_field: write_info.field,
            }
            if (!join_edges.some(edge => deep_equal(edge, join_edge))) {
                join_edges.push(join_edge)
            }

            // if the guid is a create, or for some reason doesnt have identifying fields, it is an error,
            // since a prefetch search on a nonexistent record is impossible
            const write_identifying_fields =
                write_piece.record.$identifying_fields
            if (!write_identifying_fields) {
                throw new Error(
                    `Identifying guid '${guid}' for field '${key}' resolved to a record that could not be identified (maybe it is not yet in the database, or does not have an unambiguous identifier such as a primary key). Try using a hardcoded ${key}.`
                )
            }

            return combine_wheres(
                write_identifying_fields.map(field => ({
                    $eq: [
                        { $entity: write_entity, $field: field },
                        { $escape: write_piece.record[field] },
                    ],
                })),
                '$and'
            )
        }
    })

    return combine_wheres(ands, '$and')
}

/**
 * This function generates a where clause that searches for a given record. It can only be used
 * during the mutation run, since it uses the resolved guids from previous mutation batches
 * to search for guids, instead of doing a database-lookup.
 */
export const generate_identifying_where = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[],
    identifying_fields: string[],
    mutation_piece_index: number
) => {
    const { record } = mutation_pieces[mutation_piece_index]

    const where_clauses = identifying_fields.map(key => {
        const guid = record[key]?.$guid
        if (guid === undefined) {
            // if there is no guid, we just search the raw value
            return {
                $eq: [key, { $escape: record[key] }],
            }
        } else if (record[key].$resolved_value !== undefined) {
            // use the resolved value if there is one. Sometimes we must use a resolved value, for
            // example auto-generated ids that cannot be searched for before the database actually
            // generates them. Additionally, its more efficient to use a resolved value if it is already
            // in scope
            return {
                $eq: [key, { $escape: record[key].$resolved_value }],
            }
        } else {
            // if there is a guid, we have to search based on where the guid writes from. This allows
            // us to identify records based on a read guid field.
            const write_info = guid_map.get(guid)?.write!
            const write_piece = mutation_pieces[write_info.piece_index]

            // case 1: the write guid already has a resolved value, use that.
            const write_resolved_value =
                write_piece.record[write_info.field]?.$resolved_value
            if (write_resolved_value !== undefined) {
                return {
                    $eq: [key, { $escape: write_resolved_value }],
                }
            }

            // case 2: the write guid has a guid, but it has not been resolved yet. This means that
            // we need to do a db-side search for the value. Note, this should never happen for creates
            // since create records do not exist in the db yet
            if (!write_piece.record.$identifying_fields) {
                throw new Error(
                    `Identifying guid '${guid}' for field '${key}' resolved to a record that could not be identified (maybe it is not yet in the database, or does not have an unambiguous identifier such as a primary key). Try using a hardcoded ${key}.`
                )
            }
            const write_identifying_where = generate_identifying_where(
                orma_schema,
                guid_map,
                mutation_pieces,
                write_piece.record.$identifying_fields,
                write_info.piece_index
            )
            return {
                $in: [
                    key,
                    {
                        $select: [write_info.field],
                        $from: path_to_entity(
                            mutation_pieces[write_info.piece_index].path!
                        ),
                        $where: write_identifying_where,
                    },
                ],
            }
        }
    })

    // this will not be undefined if identifying_keys is not empty, which is assumed true
    const where = combine_wheres(where_clauses, '$and') ?? {}

    return where
}

/*

item: 
{
    $operation: 'update',
    variant_id: { $guid: 'a'},
    created_at: '123'
}

variant: 
{
    $operation: 'create',
    id: { $guid: 'a'},
    map: 'test'

}


*/
