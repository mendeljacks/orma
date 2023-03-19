import { last } from '../../helpers/helpers'
import {
    get_all_edges,
    get_child_edges,
    get_parent_edges,
} from '../../helpers/schema_helpers'
import { toposort } from '../../helpers/toposort'
import { Path } from '../../types'
import { OrmaSchema } from '../../types/schema/schema_types'
import { path_to_entity } from '../helpers/mutate_helpers'
import { GuidMap } from '../macros/guid_plan_macro'
import { MutationOperation } from '../mutate'

export const get_mutation_plan = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[]
) => {
    /*
    This function is an algorithm that wont make sense without an explanation. The idea is to generate a mutate plan
    which provides 2 things:
        1. a flat list of mutation pieces (records with paths) that all have operations, sorted in the same 
           order that they should be executed
        2. a list of batches that determines which mutation pieces should be run in parallel

    The plan should run as fast as possible (have the fewest number of mutation batches) using these constraints:
        1. mutation pieces with no foreign keys can run in any order
        2. for a row to be created or updated, any parents must be processed first
        3. for a row to be deleted, any children must be processed first

    Algorithm idea:
        1. generate a toposort graph which encodes the relationships for all records in the mutation.
           Relationships are created by matching foreign key / primary keys, these can be either
           regular values or $guids
        2. toposort the graph and use this to sort the mutation pieces and generate mutation batches

    The effect will be that different sets of dependent records will form disconnected subgraphs. Running toposort on 
    the final graph will create a plan which preserves relative order within one subgraph, but does not guarantee 
    ordering among different subgraphs. This requires fewer batches than doing all the deletes, then all the updates 
    etc. since everything can be done simultaneously, although we lose some features like deleting a row first which 
    frees up a value for a unique column which is created in the same request (now we would have to reject the request 
    since we cant guarantee the delete will be run first).
*/
    const toposort_graph = generate_toposort_graph(orma_schema, mutation_pieces)
    const toposort_results = toposort(toposort_graph)

    const mutation_plan = sort_mutation_pieces(
        mutation_pieces,
        toposort_results
    )

    return mutation_plan
}

const get_fk_indices_by_value = (
    orma_schema: OrmaSchema,
    flat_mutation: MutationPiece[]
) => {
    // this should actually be all the paths to any guid, but right now guids are only enabled for foreign keys
    // so it is more efficient to pick out the foreign keys than to check every column for guids
    let fk_indices_by_value: IndicesByValue = {}

    flat_mutation.forEach(({ record, path }, record_index) => {
        const entity = path_to_entity(path)
        const from_fields = new Set(
            get_all_edges(entity, orma_schema).map(edge => edge.from_field)
        )
        from_fields.forEach(from_field => {
            const value = record[from_field]
            if (value !== undefined) {
                const value_string = get_value_identifier(
                    entity,
                    from_field,
                    value
                )

                if (!fk_indices_by_value[value_string]) {
                    fk_indices_by_value[value_string] = []
                }
                fk_indices_by_value[value_string].push(record_index)
            }
        })
    })

    return fk_indices_by_value
}

const generate_toposort_graph = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[]
) => {
    const fk_indices_by_value = get_fk_indices_by_value(
        orma_schema,
        mutation_pieces
    )

    const toposort_graph = mutation_pieces.reduce(
        (acc, mutation_piece, piece_index) => {
            const entity = path_to_entity(mutation_piece.path)
            const operation = mutation_piece.record.$operation

            // these are the graph child indices that define the ordering of the
            // toposort - parents in the toposort graph must come before children
            let child_indices: number[] = []

            // - creates / updates are executed parent-first, since for creates, the child must be
            //      created after the parent, and for updates the parent (which has the primary key) is assumed
            //      to not change, while the child (which has the foreign key) does change, so the parent writes
            //      the $guid while the child read the $guid
            // - deletes are executed child-first, since a parent can only be deleted once its children
            //      are also deleted
            const edges_to_children =
                operation === 'delete'
                    ? get_parent_edges(entity, orma_schema)
                    : get_child_edges(entity, orma_schema)

            edges_to_children.forEach(edge_to_child => {
                const value_identifier = get_value_identifier(
                    edge_to_child.to_entity,
                    edge_to_child.to_field,
                    mutation_piece.record[edge_to_child.from_field]
                )
                const connected_indices = fk_indices_by_value[
                    value_identifier
                ]?.filter(el => el !== piece_index)

                connected_indices?.forEach(i => child_indices.push(i))
            })

            acc[piece_index] = child_indices

            return acc
        },
        {} as Record<number, number[]>
    )

    return toposort_graph
}

/**
 * Sorts mutation pieces in the order they will be executed and also gives batches that say what to run in parallel
 */
const sort_mutation_pieces = <T extends unknown>(
    unsorted_mutation_pieces: T[],
    toposort_results: ReturnType<typeof toposort>
) => {
    let mutation_batches: { start_index: number; end_index }[] = []
    let mutation_pieces: T[] = []

    toposort_results.forEach(toposort_tier => {
        toposort_tier.forEach(index => {
            const mutation_piece = unsorted_mutation_pieces[index]
            mutation_pieces.push(mutation_piece)
        })
        const last_end_index = last(mutation_batches)?.end_index
        const start_index = last_end_index ?? 0
        mutation_batches.push({
            start_index,
            end_index: start_index + toposort_tier.length,
        })
    })

    return { mutation_pieces, mutation_batches }
}

const get_value_identifier = (entity: string, field: string, value: any) =>
    value?.$guid === undefined
        ? JSON.stringify([entity, field, value])
        : JSON.stringify(value?.$guid)

export const run_mutation_plan = async (
    mutation_plan: {
        mutation_pieces: MutationPiece[]
        mutation_batches: MutationBatch[]
    },
    callback: (context: {
        index: number
        mutation_batch: MutationBatch
    }) => Promise<any>
) => {
    for (
        let batch_index = 0;
        batch_index < mutation_plan.mutation_batches.length;
        batch_index++
    ) {
        const mutation_batch = mutation_plan.mutation_batches[batch_index]
        await callback({
            index: batch_index,
            mutation_batch,
        })
    }
}

export const mutation_batch_for_each = <T>(
    mutation_pieces: T[],
    mutation_batch: MutationBatch,
    callback: (mutation_piece: T, mutation_piece_index: number) => any
) => {
    for (let i = 0; i < get_mutation_batch_length(mutation_batch); i++) {
        callback(mutation_pieces[i], i)
    }
}

export const get_mutation_batch_length = (mutation_batch: MutationBatch) =>
    mutation_batch.end_index - mutation_batch.start_index

export type MutationPiece = {
    record: Record<string, any> & { $operation: MutationOperation }
    path: Path
}

export type MutationBatch = { start_index: number; end_index: number }

export type IndicesByValue = { [identifier: string]: number[] }

export type MutationPlan = {
    mutation_pieces: MutationPiece[]
    mutation_batches: MutationBatch[]
    guid_map: GuidMap
}
