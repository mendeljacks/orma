import { last } from '../../helpers/helpers'
import {
    Edge,
    get_all_edges,
    get_child_edges,
    get_parent_edges,
} from '../../helpers/schema_helpers'
import { toposort } from '../../helpers/toposort'
import { OrmaSchema } from '../../introspector/introspector'
import { Path } from '../../types'
import {
    mutation_entity_deep_for_each,
    path_to_entity,
} from '../helpers/mutate_helpers'
import { MutationOperation } from '../mutate'

export const get_mutation_plan = (mutation, orma_schema: OrmaSchema) => {
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
        1. propagate operations by copying them to all lower records (where this doesnt overwrite user provided data)
        2. infer $guids for creates and deletes that are adjacent in the json object. $guids are how the mutation
           plan will then determine which records are parents and children of each other.
        3. generate a toposort graph which encodes the relationships for all records in the mutation
        4. toposort the graph and use this to sort the mutation pieces and generate mutation batches

    The effect will be that different sets of dependent records will form disconnected subgraphs. Running toposort on 
    the final graph will create a plan which preserves relative order within one subgraph, but does not guarantee 
    ordering among different subgraphs. This requires fewer batches than doing all the deletes, then all the updates 
    etc. since everything can be done simultaneously, although we lose some features like deleting a row first which 
    frees up a value for a unique column which is created in the same request (now we would have to reject the request 
    since we cant guarantee the delete will be run first).
*/
    const mutation_pieces = flatten_mutation(mutation)
    const fk_paths_by_value = get_fk_paths_by_value(
        mutation_pieces,
        orma_schema
    )

    const toposort_graph = generate_mutation_toposort_graph(
        mutation_pieces,
        fk_paths_by_value,
        orma_schema
    )
    const toposort_results = toposort(toposort_graph)

    const mutation_plan = sort_mutation_pieces(
        mutation_pieces,
        toposort_results
    )

    return mutation_plan
}

const flatten_mutation = mutation => {
    let flat_mutation: MutationPiece[] = []
    mutation_entity_deep_for_each(mutation, (record: MutationPiece['record'], path, entity) => {
        flat_mutation.push({ record, path })
    })
    return flat_mutation
}

const get_fk_paths_by_value = (
    flat_mutation: MutationPiece[],
    orma_schema: OrmaSchema
) => {
    // this should actually be all the paths to any guid, but right now guids are only enabled for foreign keys
    // so it is more efficient to pick out the foreign keys than to check every column for guids
    let fk_paths_by_value: PathsByGuid = {}

    flat_mutation.forEach(({ record, path }, record_index) => {
        const entity = path_to_entity(path)
        const from_fields = new Set(
            get_all_edges(entity, orma_schema).map(edge => edge.from_field)
        )
        from_fields.forEach(from_field => {
            const value = record[from_field]
            if (value !== undefined) {
                const value_string = JSON.stringify(value)
                if (!fk_paths_by_value[value_string]) {
                    fk_paths_by_value[value_string] = []
                }
                fk_paths_by_value[value_string].push([record_index, from_field])
            }
        })
    })

    return fk_paths_by_value
}

const generate_mutation_toposort_graph = (
    mutation_pieces: MutationPiece[],
    fk_paths_by_value: Record<any, any>,
    orma_schema: OrmaSchema
) => {
    // toposort graph is generated by taking dependencies of creates and deletes. Every individual record in the
    // mutation will end up in the graph (even if they might not have any graph children)
    type ToposortGraph = { [parent_index: number]: number[] }

    const toposort_graph = mutation_pieces.reduce(
        (acc, mutation_piece, toposort_parent_index) => {
            const parent_record = mutation_piece.record
            const entity = path_to_entity(mutation_piece.path)

            const operation = parent_record.$operation

            // deletes are processed in reverse, so we must flip the ordering in that case
            const child_edges =
                operation === 'create' || operation === 'update'
                    ? get_child_edges(entity, orma_schema)
                    : operation === 'delete'
                    ? get_parent_edges(entity, orma_schema)
                    : []

            // for each possible child edge based on the foreign keys, we only take ones that are in the mutation
            // (we check the fk_paths_by_value map for this)
            const child_indices = child_edges.flatMap(child_edge => {
                return get_toposort_child_indices(
                    mutation_pieces,
                    parent_record,
                    child_edge,
                    fk_paths_by_value
                )
            })

            // if there are no toposort child indices, this will be an empty array but we still need to set it
            // so that all records end up in the toposort results
            acc[toposort_parent_index] = child_indices

            return acc
        },
        {} as ToposortGraph
    )

    return toposort_graph
}

const get_toposort_child_indices = (
    mutation_pieces: MutationPiece[],
    parent_record: Record<string, any>,
    edge_to_child: Edge,
    fk_paths_by_value: PathsByGuid
) => {
    const parent_value = parent_record[edge_to_child.from_field]
    // there may be no paths if there are no children in the mutation, so we default to []
    const all_child_paths =
        fk_paths_by_value[JSON.stringify(parent_value)] ?? []

    // take the foreign key paths that match the child edge we are looking for
    const child_paths = all_child_paths.filter(child_path => {
        const mutation_piece = mutation_pieces[child_path[0]]
        const child_entity = path_to_entity(mutation_piece.path)
        const child_field = child_path[1]
        return (
            child_entity === edge_to_child.to_entity &&
            child_field === edge_to_child.to_field
        )
    })

    return child_paths.map(el => el[0])
}

/**
 * Sorts mutation pieces in the order they will be executed and also gives batches that say what to run in parallel
 */
const sort_mutation_pieces = (
    unsorted_mutation_pieces: MutationPiece[],
    toposort_results: ReturnType<typeof toposort>
) => {
    let mutation_batches: { start_index: number; end_index }[] = []
    let mutation_pieces: MutationPiece[] = []

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

export type MutationPiece = { record: Record<string, any> & { $operation: MutationOperation }; path: Path }

export type MutationBatch = { start_index: number; end_index: number }

export type PathsByGuid = { [stringified_value: string]: [number, string][] }

export type MutationPlan = {
    mutation_pieces: MutationPiece[]
    mutation_batches: MutationBatch[]
}

export const run_mutation_plan = async (
    mutation_plan: {
        mutation_pieces: MutationPiece[]
        mutation_batches: MutationBatch[]
    },
    callback: (context: {
        index: number
        mutation_pieces: MutationPiece[]
        mutation_batch: MutationBatch
    }) => Promise<any>
) => {
    for (
        let batch_index = 0;
        batch_index < mutation_plan.mutation_batches.length;
        batch_index++
    ) {
        const mutation_batch = mutation_plan.mutation_batches[batch_index]
        const batch_pieces = mutation_plan.mutation_pieces.slice(
            mutation_batch.start_index,
            mutation_batch.end_index
        )
        await callback({
            index: batch_index,
            mutation_pieces: batch_pieces,
            mutation_batch,
        })
    }
}
