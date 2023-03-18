import { GuidMap } from '../macros/guid_plan_macro'
import { MutationPiece } from '../plan/mutation_plan'

/**
 * MUTATES THE INPUT MUTATION
 */
export const replace_guids_with_values = (
    mutation_pieces: MutationPiece[],
    guid_map: GuidMap
) => {
    for (const guid of guid_map.keys()) {
        const write = guid_map.get(guid)!.write
        const write_record = mutation_pieces[write.piece_index].record
        const write_value = write_record[write.field].$resolved_value

        guid_map.get(guid)!.reads.forEach(read => {
            const read_record = mutation_pieces[read.piece_index].record
            read_record[read.field] = write_value
        })
    }
}
