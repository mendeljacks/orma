import { PathedRecord } from '../../types'
import { MutationPlan } from '../plan/mutation_batches'

/**
 * MUTATES THE INPUT. Converts any $guid to either a read or a write, based on where
 * the guids are in the mutation plan. A guid will written to for the first batch it is
 * encountered in, then for a ll subsequent batches that guid will be read from.
 * Returns a map that tracks where each read and write guids are in the mutation
 */
export const apply_guid_plan_macro = (
    mutation_pieces: Pick<PathedRecord, 'record'>[],
    mutation_batches: MutationPlan['mutation_batches']
) => {
    const guid_map: GuidMap = new Map()
    // const batch_indices_by_guid: Map<any, number[]> = new Map()

    // we need to track mutation batches, since a guid can only be a read if another
    // matching guid is a write in a previous batch (since all records in a single batch are
    // processed in parallel). If a guid appears for the first time twice in a
    // single batch, they both must be writes.
    mutation_batches.forEach((batch, batch_index) => {
        for (
            let piece_index = batch.start_index;
            piece_index < batch.end_index;
            piece_index++
        ) {
            const record = mutation_pieces[piece_index].record

            // check all values in the record for guids
            Object.entries(record).forEach(([column, value]) => {
                const guid = value?.$guid
                if (guid !== undefined) {
                    const guid_map_el = guid_map.get(guid)
                    const guid_info = { batch_index, piece_index, column }

                    // if this guid was not encountered yet, it is definitely a write.
                    // if the guid was only encountered in this batch (so not in any
                    // previous batches), then it is also a write. This should never happen, but if it does
                    // we can just overwrite the previous guid in the map (since that's what will happen when
                    // the mutation is executed)
                    if (
                        !guid_map_el ||
                        guid_map_el.write.batch_index === batch_index
                    ) {
                        guid_map.set(guid, {
                            write: guid_info,
                            reads: [],
                        })
                        record[column].$write = true
                        return
                    }

                    // The guid was encountered in a previous batch so it is a read
                    record[column].$read = true
                    guid_map_el.reads.push(guid_info)
                }
            })
        }
    })

    return guid_map
}

type Guid = string | number
export type GuidMap = Map<
    Guid,
    {
        write: { piece_index: number; batch_index: number; column: string }
        reads: { piece_index: number; batch_index: number; column: string }[]
    }
>
