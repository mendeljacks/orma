import { array_equals, last } from '../../helpers/helpers'
import { PathedRecord } from '../../types'
import { MutationPlan } from '../plan/mutation_plan'

/**
 * MUTATES THE INPUT. Converts any $guid to either $read_guid or $write_guid, based on where
 * the guids are in the mutation plan. A guid will written to for the first batch it is
 * encountered in, then for a ll subsequent batches that guid will be read from
 */
export const apply_guid_plan_macro = (
    mutation_pieces: Pick<PathedRecord, 'record'>[],
    mutation_batches: MutationPlan['mutation_batches']
) => {
    const batch_indices_by_guid: Map<any, number[]> = new Map()

    // we need to track mutation batches, since a guid can only be a read if another
    // matching guid is a write in a previous batch (since all records in a single batch are
    // processed in parallel). Therefore if a guid appears for the first time twice in a
    // single batch, they both must be writes.
    mutation_batches.forEach((batch, batch_index) => {
        for (let i = batch.start_index; i < batch.end_index; i++) {
            const record = mutation_pieces[i].record

            // check all values in the record for guids
            Object.entries(record).forEach(([key, value]) => {
                const guid = value?.$guid
                if (guid !== undefined) {
                    const encountered_batches =
                        batch_indices_by_guid.get(guid) ?? []
                    const last_batch = last(encountered_batches)

                    // if this guid was not encountered yet, it is definitely a write
                    if (last_batch === undefined) {
                        batch_indices_by_guid.set(guid, [batch_index])
                        record[key] = { $write_guid: guid }
                    } else {
                        // if the guid was only encountered in this batch (so not in any
                        // previous batches), then it is a write
                        if (array_equals(encountered_batches, [batch_index])) {
                            record[key] = { $write_guid: guid }
                        } else {
                            // otherwise, the guid was encountered in a previous batch
                            // so it is a read
                            record[key] = { $read_guid: guid }
                            batch_indices_by_guid.get(guid)?.push(batch_index)
                        }

                        // we only need to record the batch index once, and the batch index
                        // might already be recorded if we encountered this guid already
                        // in this batch
                        if (last_batch !== batch_index) {
                            encountered_batches.push(batch_index)
                        }
                    }
                }
            })
        }
    })
}
