import { apply_escape_macro_to_query_part } from '../../query/macros/escaping_macros'
import { OrmaSchema } from '../../types/schema/schema_types'
import { get_identifying_where } from '../helpers/record_searching'
import { GuidMap } from '../macros/guid_plan_macro'
import { get_identifying_fields } from '../macros/identifying_fields_macro'
import { MutationPiece } from '../plan/mutation_batches'

/**
 * Generates a query which, when run, will return all the data needed to
 *  1. match database record with mutation record (the identifying keys)
 *  2. replace guids with their resolved value (any field with a $guid)
 * Data is returned for all creates and updated in the input mutation pieces
 */
export const get_guid_query = (
    mutation_pieces: MutationPiece[],
    piece_indices: number[],
    entity: string,
    guid_map: GuidMap,
    orma_schema: OrmaSchema
) => {
    if (piece_indices.length === 0) {
        return undefined // can happen if the mutation is all deletes
    }

    // get a list of fields with guids that we should query
    const guid_fields = piece_indices.reduce<Set<string>>(
        (acc, piece_index) => {
            const record = mutation_pieces[piece_index].record
            Object.keys(record).forEach(key => {
                if (record[key]?.$guid !== undefined) {
                    acc.add(key)
                }
            })
            return acc
        },
        new Set()
    )

    // get identifying keys which are needed for matching records later
    const all_identifying_fields = piece_indices.reduce((acc, piece_index) => {
        const record = mutation_pieces[piece_index].record
        const identifying_fields =
            record?.$identifying_fields ??
            get_identifying_fields(
                orma_schema,
                entity,
                record,
                // we dont mind if the unique key is ambiguous, since the choice of key doesnt do anything
                // (unlike in an update, where it determines which fields are modified). We just select any key in
                // a repeatable way so we can do row matching later
                true
            )
        identifying_fields.forEach(field => acc.add(field))
        return acc
    }, new Set<string>())

    // can happen for updates that dont do anything and so dont have identifying fields
    if (all_identifying_fields.size === 0) {
        return undefined
    }

    const $where = get_identifying_where(
        orma_schema,
        guid_map,
        mutation_pieces,
        piece_indices
    )
    // must apply escape macro since we need valid SQL AST
    apply_escape_macro_to_query_part(orma_schema, entity, $where)

    // guid fields are needed for foreign key propagation while identifying keys are just needed to match up
    // database rows with mutation rows later on. Unique fields so they only appear once in select
    const fields = [...new Set([...guid_fields, ...all_identifying_fields])]
    if (guid_fields.size === 0) {
        return undefined // can happen if there are no guids in the mutation
    }

    const query = {
        $select: fields,
        $from: entity,
        $where,
    }

    return query
}
