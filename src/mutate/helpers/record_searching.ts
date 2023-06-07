import { combine_wheres } from '../../query/query_helpers'
import { PathedRecord } from '../../types'
import { OrmaSchema } from '../../types/schema/schema_types'
import { GuidMap } from '../macros/guid_plan_macro'
import { get_identifying_fields } from '../macros/identifying_fields_macro'
import { MutationPiece } from '../plan/mutation_batches'
import { path_to_entity } from './mutate_helpers'

export const get_identifying_where = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: PathedRecord[],
    mutation_piece_indices: number[]
) => {
    const values_by_fields = mutation_piece_indices.reduce(
        (acc, mutation_piece_index) => {
            const { record, path } = mutation_pieces[mutation_piece_index]
            const entity = path_to_entity(path ?? [])

            const identifying_fields: string[] =
                record.$identifying_fields ??
                get_identifying_fields(orma_schema, entity, record, true)
            const values = identifying_fields.map(field =>
                get_search_value(
                    orma_schema,
                    guid_map,
                    mutation_pieces,
                    mutation_piece_index,
                    field
                )
            )

            const fields_string = JSON.stringify(identifying_fields)

            if (!acc[fields_string]) {
                acc[fields_string] = []
            }

            acc[fields_string].push(values.length === 1 ? values[0] : values)
            return acc
        },
        {} as Record<string, unknown[]>
    )

    const ors = Object.entries(values_by_fields).map(
        ([field_string, value]) => {
            const fields = JSON.parse(field_string)
            return {
                $in: [fields.length === 1 ? fields[0] : fields, value],
            }
        }
    )

    // if there are no identifying fields, we want a where clause that returns no rows (as opposed to no where
    // clause at all, which would return all rows)
    const where =
        ors.length > 0
            ? combine_wheres(ors, '$or')
            : { $eq: [{ $escape: 1 }, { $escape: 2 }] }

    return where
}

const get_search_value = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: PathedRecord[],
    mutation_piece_index: number,
    field: string
) => {
    const { record } = mutation_pieces[mutation_piece_index]
    const guid = record[field]?.$guid

    // basic case has no guids
    const no_guid = guid === undefined
    if (no_guid) {
        return { $escape: record[field] }
    }

    // use the resolved value if there is one. Sometimes we must use a resolved value, for
    // example auto-generated ids that cannot be searched for before the database actually
    // generates them. Additionally, its more efficient to use a resolved value if it is already
    // in scope
    const has_resolved_value = record[field].$resolved_value !== undefined
    if (has_resolved_value) {
        return { $escape: record[field].$resolved_value }
    }

    // if there is a guid, and its a $read guid, we have to search based on the corresponding
    // $write guid
    const has_read_guid = record[field]?.$read
    if (has_read_guid) {
        const write_info = guid_map.get(guid)?.write!
        const write_piece = mutation_pieces[write_info.piece_index]

        // case 1: the write guid already has a resolved value, use that.
        const write_resolved_value =
            write_piece.record[write_info.field]?.$resolved_value
        if (write_resolved_value !== undefined) {
            return { $escape: write_resolved_value }
        }

        // case 2: the write guid has not been resolved yet. This means that we need to do a
        // db-side search for the value. Note, this should never happen for creates
        // since create records do not exist in the db yet
        if (!write_piece.record.$identifying_fields) {
            throw new Error(
                `Identifying guid '${guid}' for field '${field}' resolved to a record that could not be identified (maybe it is not yet in the database, or does not have an unambiguous identifier such as a primary key). Try using a hardcoded '${field}'.`
            )
        }
        const write_identifying_where = get_identifying_where(
            orma_schema,
            guid_map,
            mutation_pieces,
            [write_info.piece_index]
        )
        return {
            $select: [write_info.field],
            $from: path_to_entity(write_piece.path!),
            $where: write_identifying_where,
        }
    }

    throw new Error('Something went wrong with generating identifying where.')
}

export const generate_identifying_where = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[],
    identifying_fields: string[],
    mutation_piece_index: number
) => {
    const { path, record } = mutation_pieces[mutation_piece_index]

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
