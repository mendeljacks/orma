import { Path } from '../../types'

/**
 * MUTATES THE INPUT. Flattens a nested mutation into a flat list of mutation pieces. Keeps track of
 * the original path, and indices of higher and lower mutation pieces.
 * @example
 * const mutation_pieces = apply_nesting_mutation_macro(mutation)
 * const lower_path = mutation_pieces[i].path // ['users', 0, 'posts', 0]
 * const higher_index = mutation_pieces[i].higher_index
 * const higher_path = mutation_pieces[higher_index].path // ['users', 0]
 */
export const apply_nesting_mutation_macro = mutation => {
    let flat_mutation: NestingMutationOutput = [
        {
            record: mutation,
            path: [],
            higher_index: -1,
            lower_indices: [],
        },
    ]

    // processed here means that all lower records have been added to the flat_mutation. At any point in this
    // function, flat_mutation[i] is processed for all i <= last_processed_index. Therefore when
    // last_processed_index === flat_mutation.length - 1, then everything in the flat_mutation has been processed,
    // so there are no more children to add to the flat_mutation, which means the entire mutation was traveresed
    // and flattened, so we are done.
    let last_processed_index = -1

    while (last_processed_index < flat_mutation.length - 1) {
        const higher_index = last_processed_index + 1
        const higher_piece = flat_mutation[higher_index]

        // array implies lower records (as opposed to a field value or a $guid). This is the current way
        // it works in mutations, but could change at some point if we allow nesting parents with objects directly
        Object.keys(higher_piece.record).forEach(prop => {
            if (Array.isArray(higher_piece.record[prop])) {
                higher_piece.record[prop].forEach((lower_record, i) => {
                    // add the lower record to the flat mutation, then link the higher and lower records
                    // via their higher_index and lower_indices props
                    const lower_path = [...higher_piece.path, prop, i]
                    flat_mutation.push({
                        record: lower_record,
                        path: lower_path,
                        // -1 since the first element is the mutation itself that will be removed
                        ...(higher_index === 0
                            ? {}
                            : { higher_index: higher_index - 1 }),
                        lower_indices: [],
                    })
                    // the lower index is the last index, since we just added it
                    const lower_index = flat_mutation.length - 1
                    // -1 since the first element is the mutation itself that will be removed
                    higher_piece.lower_indices.push(lower_index - 1)
                })

                // we dont want child entities in the flat_mutation. This makes the flat_mutation
                // simpler to parse e.g. when iterating over all its properties, we now know that
                // each property is actually a field and not a nested entity
                delete higher_piece.record[prop]
            }
        })

        last_processed_index += 1
    }

    // the first element is the mutation itself, which is not actually a record, so we remove it
    flat_mutation.shift()

    return flat_mutation
}

export type NestingMutationOutput = {
    record: Record<string, any> & { $operation: 'create' | 'update' | 'delete' | 'upsert'}
    path: Path
    higher_index?: number
    lower_indices: number[]
}[]
