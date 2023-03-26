import { GuidMap } from '../macros/guid_plan_macro'
import {
    get_mutation_batch_length,
    MutationBatch,
    MutationPiece,
} from '../plan/mutation_plan'

export const save_resolved_guid_values = (
    mutation_pieces: MutationPiece[],
    mutation_batch: MutationBatch,
    sorted_database_rows: (Record<string, any> | undefined)[]
) => {
    if (
        get_mutation_batch_length(mutation_batch) !==
        sorted_database_rows.length
    ) {
        throw new Error(
            'Mutation batch should be the same length as sorted db rows. Something went very wrong.'
        )
    }

    sorted_database_rows.forEach((database_row, database_row_index) => {
        // database rows should be sorted in the same order as the mutation pieces in this batch,
        // which is why adding the indices like this works
        const piece_index = mutation_batch.start_index + database_row_index
        const { record } = mutation_pieces[piece_index]
        Object.keys(record).forEach(prop => {
            const value = record[prop]
            if (value?.$guid !== undefined && value.$write) {
                value.$resolved_value = database_row?.[prop]
            }
        })
    })
}

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

        write_record[write.field] = write_value
    }
}
