import { NestingMutationOutput } from './nesting_mutation_macro'

/**
 * MUTATES THE INPUT. Adds operations according to these rules:
 *   1. a record with an existing $operation is not modified
 *   2. a record without an $operation gets the same operation as the record
 *      directly above it (for root level records, the $operation above is the root
 *      level operation). This can cascade down multiple layers, so that an
 *      operation cascades to a child record, and then again to a grandchild record.
 */
export const apply_inherit_operations_macro = (
    mutation_pieces: InheritOperationMacroInput,
    root_operation: Operation | undefined
) => {
    const processed_indices = new Set(
        Array.from(Array(mutation_pieces.length).keys())
    )
    while (processed_indices.size > 0) {
        let [index] = processed_indices
        propagate_operation(
            mutation_pieces,
            root_operation,
            processed_indices,
            index
        )
    }
}

/**
 * MUTATES THE INPUT. Recursively propagates operations from a given index up to the
 * root of the tree
 */
const propagate_operation = (
    mutation_pieces: InheritOperationMacroInput,
    root_operation: Operation | undefined,
    processed_indices: Set<number>,
    index: number
) => {
    const piece = mutation_pieces[index]
    const operation = piece.record.$operation
    if (operation === undefined) {
        const higher_index = piece.higher_index
        const use_root_operation = higher_index === undefined && root_operation
        const higher_operation = use_root_operation
            ? root_operation
            : propagate_operation(
                  mutation_pieces,
                  root_operation,
                  processed_indices,
                  higher_index!
              )

        piece.record.$operation = higher_operation
        processed_indices.delete(index)
        return higher_operation
    } else {
        return operation
    }
}

type Operation = NestingMutationOutput[number]['record']['$operation']
export type InheritOperationMacroInput = (Omit<
    NestingMutationOutput[number],
    'record'
> & {
    record: Record<string, any>
})[]
