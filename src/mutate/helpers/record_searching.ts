import { orma_escape } from '../../helpers/escape'
import { combine_wheres } from '../../query/query_helpers'
import { OrmaSchema } from '../../types/schema/schema_types'
import { GuidMap } from '../macros/guid_plan_macro'
import { MutationPiece } from '../plan/mutation_plan'
import { path_to_entity } from './mutate_helpers'

// export const generate_record_where_clause = (
//     mutation_piece: MutationPiece,
//     values_by_guid: ValuesByGuid,
//     orma_schema: OrmaSchema,
//     allow_ambiguous_unique_keys: boolean = false,
//     throw_on_no_identifying_keys: boolean = true
// ) => {
//     const { record, path } = mutation_piece
//     const entity_name = path_to_entity(path)

//     const identifying_keys = get_identifying_fields(
//         entity_name,
//         record,
//         values_by_guid,
//         orma_schema,
//         allow_ambiguous_unique_keys
//     )

//     if (throw_on_no_identifying_keys) {
//         // throw if we cant find a unique key
//         throw_identifying_key_errors(record.$operation, identifying_keys, path)
//     } else if (!identifying_keys?.length) {
//         return { identifying_keys }
//     }

//     const where = generate_record_where_clause_from_identifying_keys(
//         values_by_guid,
//         identifying_keys,
//         mutation_piece.record
//     )

//     return { where, identifying_keys }
// }

export const generate_identifying_where = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[],
    identifying_keys: string[],
    mutation_piece_index: number
) => {
    const { path, record } = mutation_pieces[mutation_piece_index]
    const entity = path_to_entity(path)
    const database_type = orma_schema.$entities[entity].$database_type

    const where_clauses = identifying_keys.map(key => {
        const guid = record[key]?.$guid
        if (guid === undefined) {
            // if there is no guid, we just search the raw value
            return {
                $eq: [key, orma_escape(record[key], database_type)],
            }
        } else if (record[key].$resolved_value !== undefined) {
            // use the resolved value if there is one. Sometimes we must use a resolved value, for
            // example auto-generated ids that cannot be searched for before the database actually
            // generates them. Additionally, its more efficient to use a resolved value if it is already
            // in scope
            return {
                $eq: [key, orma_escape(record[key].$resolved_value, database_type)],
            }
        } else {
            // if there is a guid, we have to search based on where the guid writes to.
            const write_info = guid_map.get(guid)?.write!
            const write_piece = mutation_pieces[write_info.piece_index]
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
