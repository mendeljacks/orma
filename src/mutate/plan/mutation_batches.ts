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
import { get_identifying_fields } from '../macros/identifying_fields_macro'
import { MutationOperation, operation } from '../mutate'

type MutationBatchObject = {
    mutation_pieces: MutationPiece[]
    mutation_batches: MutationBatch[]
}
export const get_mutation_batches = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[]
): MutationBatchObject => {
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

const generate_toposort_graph = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[]
) => {
    const fk_index = get_fk_index(orma_schema, mutation_pieces)

    const toposort_graph = mutation_pieces.reduce(
        (acc, mutation_piece, piece_index) => {
            const entity = path_to_entity(mutation_piece.path)
            const operation = mutation_piece.record.$operation as
                | MutationOperation
                | 'upsert'

            // these are the graph child indices that define the ordering of the
            // toposort - parents in the toposort graph must come before children
            let child_indices: number[] = []
            const add_child_index = el => child_indices.push(el)

            const parent_edges = get_parent_edges(entity, orma_schema)
            const child_edges = get_child_edges(entity, orma_schema)

            if (operation === 'create' || operation === 'upsert') {
                const child_operations = ['create', 'update', 'upsert'] as const
                child_operations.forEach(child_operation => {
                    child_edges.forEach(edge_to_child => {
                        const own_pk_value =
                            mutation_piece.record[edge_to_child.from_field]
                        fk_index_lookup(
                            fk_index,
                            edge_to_child.to_entity,
                            edge_to_child.to_field,
                            child_operation,
                            own_pk_value,
                            add_child_index
                        )
                    })
                })
            }
            if (operation === 'update' || operation === 'upsert') {
                parent_edges.forEach(edge_to_parent => {
                    fk_index_lookup_any_value(
                        fk_index,
                        edge_to_parent.to_entity,
                        edge_to_parent.to_field,
                        'delete',
                        add_child_index
                    )
                })
                child_edges.forEach(edge_to_child => {
                    if (
                        is_field_updated(
                            orma_schema,
                            entity,
                            edge_to_child.from_field,
                            mutation_piece.record
                        )
                    ) {
                        const child_operations = [
                            'create',
                            'update',
                            'upsert',
                        ] as const
                        child_operations.forEach(child_operation => {
                            child_edges.forEach(edge_to_child => {
                                const own_pk_value =
                                    mutation_piece.record[
                                        edge_to_child.from_field
                                    ]
                                fk_index_lookup(
                                    fk_index,
                                    edge_to_child.to_entity,
                                    edge_to_child.to_field,
                                    child_operation,
                                    own_pk_value,
                                    add_child_index
                                )
                            })
                        })
                    }
                })
            }
            if (operation === 'delete') {
                parent_edges.forEach(edge_to_parent => {
                    const own_fk_value =
                        mutation_piece.record[edge_to_parent.from_field]
                    fk_index_lookup(
                        fk_index,
                        edge_to_parent.to_entity,
                        edge_to_parent.to_field,
                        'delete',
                        own_fk_value,
                        add_child_index
                    )
                    fk_index_lookup_any_value(
                        fk_index,
                        edge_to_parent.to_entity,
                        edge_to_parent.to_field,
                        'update',
                        add_child_index
                    )
                    fk_index_lookup_any_value(
                        fk_index,
                        edge_to_parent.to_entity,
                        edge_to_parent.to_field,
                        'upsert',
                        add_child_index
                    )
                })
            }

            // // - creates / updates are executed parent-first, since for creates, the child must be
            // //      created after the parent, and for updates the parent (which has the primary key) is assumed
            // //      to not change, while the child (which has the foreign key) does change, so the parent writes
            // //      the $guid while the child read the $guid
            // // - deletes are executed child-first, since a parent can only be deleted once its children
            // //      are also deleted
            // const edges_to_children =
            //     operation === 'delete'
            //         ? get_parent_edges(entity, orma_schema)
            //         : get_child_edges(entity, orma_schema)

            // edges_to_children.forEach(edge_to_child => {
            //     const value_identifier = get_value_identifier(
            //         edge_to_child.to_entity,
            //         edge_to_child.to_field,
            //         mutation_piece.record[edge_to_child.from_field]
            //     )
            //     const connected_indices = fk_index[value_identifier]

            //     connected_indices?.forEach(i => {
            //         if (
            //             operation === 'update' &&
            //             mutation_pieces[i].record.$operation === 'delete'
            //         ) {
            //             // when the parent is an update and the child is a delete, we want the delete to
            //             // come before the update (so you can delete the child and then update the parent to
            //             // a different id). Not having this will also cause the toposort to try putting the
            //             // update before the delete which will create a loop (a plan with the update before
            //             // the delete and the delete before the update is impossible)
            //             return
            //         }

            //         if (i !== piece_index) {
            //             child_indices.push(i)
            //         }
            //     })
            // })

            acc[piece_index] = child_indices

            return acc
        },
        {} as Record<number, number[]>
    )

    return toposort_graph
}

const get_fk_index = (
    orma_schema: OrmaSchema,
    flat_mutation: MutationPiece[]
) => {
    // this should actually include all the paths to any guid, but right now guids are only enabled for foreign keys
    // so it is more efficient to pick out the foreign keys than to check every column for guids
    let fk_index: FkIndex = {}

    flat_mutation.forEach(({ record, path }, record_index) => {
        const entity = path_to_entity(path)
        const from_fields = new Set(
            get_all_edges(entity, orma_schema).map(edge => edge.from_field)
        )
        from_fields.forEach(from_field => {
            // ignore non-updated fields since no cases require them to be checked
            if (
                record.$operation === 'update' &&
                !is_field_updated(orma_schema, entity, from_field, record)
            ) {
                return
            }
            const value = record[from_field]
            if (value !== undefined) {
                set_fk_index(
                    fk_index,
                    record_index,
                    entity,
                    from_field,
                    record.$operation,
                    value
                )
            }
        })
    })

    return fk_index
}

const is_field_updated = (
    orma_schema: OrmaSchema,
    entity: string,
    field: string,
    record: Record<string, any> & { $identifying_fields?: string[] }
) => {
    // returning false optimizes the mutation plan by excluding this field if it is being used
    // as an identifying field or otherwise not being updated. If unsure, this should return
    // true since that just adds more constraints to the mutation plan which might make it
    // go slower by adding more stages, but will never result in an error. Returning false
    // when its not supposed to might merge states that should be separate and so
    // cause an error.

    if (record[field] === undefined) {
        return false
    }

    // since the macro that puts in $read and $write guids did not run yet, there are cases where
    // there is an ambiguous identifying fields that will be resolved once one of them are marked
    // as a $write guid which disqualifies that field. In this case, the identifying fields will
    // be empty, and we just return the safe option of true from this function. If there are
    // non-ambiguous identifying fields however, they shouldn't change after this point so its
    // safe to rely on them to optimize the mutation plan
    const identifying_fields =
        record.$identifying_fields ??
        get_identifying_fields(orma_schema, entity, record, false)

    // guids (which at this stage are not marked $read or $write) could later become a write guid (which would
    // not be a valid identifying field, and so would cause it to actually be an updated field),
    // so we need to be safe and not optimize them out of the constraint graph
    const identifying_fields_are_guids = identifying_fields.some(
        field => record[field]?.$guid !== undefined
    )
    if (
        identifying_fields.length &&
        identifying_fields.includes(field) &&
        !identifying_fields_are_guids
    ) {
        return false
    }

    return true
}

/**
 * The wierd index format is because we need two types of lookups:
 *   1. Lookup a specific entity, field, operation and value combo
 *   2. Lookup a specific entity, field and operation but get all values
 * This format handles those cases while minimizing heap allocation (better to have as many of the
 * lookup props combined in a string as possible, so we dont have so many nested objects and arrays
 * which would allocate more things to the heap). This index is made for the whole mutation, so
 * we do want to optimize it. Also this format means less deep getting and setting, which is nice.
 */
type FkIndex = {
    [entity_field_operation_string: string]: {
        [value_string: string]: number[]
    }
}
const set_fk_index = (
    fk_index: FkIndex,
    piece_index: number,
    entity: string,
    field: string,
    operation: MutationOperation | 'upsert',
    value: any
) => {
    const entity_field_operation_string = `${entity},${field},${operation}`
    const value_string = JSON.stringify(value)
    if (!fk_index[entity_field_operation_string]) {
        fk_index[entity_field_operation_string] = {}
    }

    if (!fk_index[entity_field_operation_string][value_string]) {
        fk_index[entity_field_operation_string][value_string] = []
    }
    fk_index[entity_field_operation_string][value_string].push(piece_index)
}

const fk_index_lookup = (
    fk_index: FkIndex,
    entity: string,
    field: string,
    operation: MutationOperation | 'upsert',
    value: any,
    callback: (piece_index) => any
) => {
    const entity_field_operation_string = `${entity},${field},${operation}`
    const value_string = JSON.stringify(value)
    const piece_indices =
        fk_index?.[entity_field_operation_string]?.[value_string] ?? []
    for (const piece_index of piece_indices) {
        callback(piece_index)
    }
}
const fk_index_lookup_any_value = (
    fk_index: FkIndex,
    entity: string,
    field: string,
    operation: MutationOperation | 'upsert',
    callback: (piece_index) => any
) => {
    const entity_field_operation_string = `${entity},${field},${operation}`
    const piece_indices_by_value = fk_index[entity_field_operation_string] ?? {}
    for (const piece_indices of Object.values(piece_indices_by_value)) {
        for (const piece_index of piece_indices) {
            callback(piece_index)
        }
    }
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
    mutation_batch: MutationBatch | number[],
    callback: (mutation_piece: T, mutation_piece_index: number) => any
) => {
    if (Array.isArray(mutation_batch)) {
        mutation_batch.forEach(mutation_piece_index => {
            callback(
                mutation_pieces[mutation_piece_index],
                mutation_piece_index
            )
        })
    } else {
        for (
            let i = mutation_batch.start_index;
            i < mutation_batch.end_index;
            i++
        ) {
            callback(mutation_pieces[i], i)
        }
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
