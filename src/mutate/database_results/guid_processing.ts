import { mutation_entity_deep_for_each } from '../helpers/mutate_helpers'
import { ValuesByGuid } from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'

/**
 * Saves guid values into the provided index. Database rows should be in the same order as the mutation rows.
 * Will mutate the input values_by_guid
 */
export const save_guids = (
    values_by_guid: ValuesByGuid,
    mutation_pieces: MutationPiece[],
    sorted_database_rows: (Record<string, any> | undefined)[]
) => {
    mutation_pieces.forEach((mutation_piece, mutation_piece_index) => {
        Object.keys(mutation_piece.record).forEach(field => {
            const guid = mutation_piece.record[field]?.$guid
            const db_value = sorted_database_rows?.[mutation_piece_index]?.[field]

            if (guid !== undefined && db_value !== undefined) {
                values_by_guid[guid] = db_value
            }
        })
    })
}

/**
 * MUTATES THE INPUT MUTATION
 */
export const replace_guids_with_values = (
    mutation: any,
    values_by_guid: ValuesByGuid
) => {
    mutation_entity_deep_for_each(mutation, (record, path) => {
        Object.keys(record).forEach(field => {
            const guid = record[field]?.$guid
            if (guid !== undefined) {
                const guid_value = values_by_guid[guid]
                record[field] = guid_value
            }
        })
    })
}
