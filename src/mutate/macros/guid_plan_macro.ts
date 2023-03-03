import { last } from '../../helpers/helpers'
import { PathedRecord } from '../../types'
import { MutationPiece, MutationPlan } from '../plan/mutation_plan'

/**
 * MUTATES THE INPUT. Converts any $guid to either $read_guid or $write_guid, based on where
 * the guids are in the mutation plan.
 */
export const apply_guid_plan_macro = (mutation_pieces: PathedRecord[]) => {
    const previous_guids: Set<any> = new Set()

    mutation_pieces.forEach(({ record }) => {
        Object.entries(record).forEach(([key, value]) => {
            const guid = value?.$guid
            if (guid !== undefined) {
                if (!previous_guids.has(guid)) {
                    batches_indices_by_guid[guid] = [batch_index]
                    record[key] = { $write_guid: guid }
                } else {
                    batches_indices_by_guid[guid].push(batch_index)
                    record[key] = { $read_guid: guid }
                }
            }
        })
    })
}
