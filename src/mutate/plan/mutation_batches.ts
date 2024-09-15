import { last } from '../../helpers/helpers'
import {
    get_all_edges,
    get_child_edges,
    get_parent_edges
} from '../../helpers/schema_helpers'
import { toposort } from '../../helpers/toposort'
import { Path } from '../../types'
import { OrmaSchema } from '../../schema/schema_types'
import { path_to_table } from '../helpers/mutate_helpers'
import { GuidMap } from '../macros/guid_plan_macro'
import { get_identifying_columns } from '../macros/identifying_columns_macro'
import { MutationOperation } from '../mutate'
import {
    MutationPlanConstraint,
    mutation_plan_constraints
} from './mutation_plan_constraints'

/**
 * The idea here is to generate a mutate plan which provides 2 things:
 *     1. a flat list of mutation pieces (records with paths) that all have operations, sorted in the same
 *        order that they should be executed
 *     2. a list of batches that determines which mutation pieces should be run in parallel
 *
 * The plan should run as fast as possible (have the fewest number of mutation batches), while
 * satisfying all the constraints provided in {@link mutation_plan_constraints}
 *
 * To do this we:
 *     1. generate a toposort graph which encodes the constraints for all records in the mutation.
 *        Relationships are created by matching foreign key / primary keys, these can be either
 *        regular values or $guids
 *     2. toposort the graph and use this to sort the mutation pieces and generate mutation batches
 *
 * Note that the toposort graph is per record as opposed to per table. This does have a performance
 * cost, but allows more advanced query planning like self-referential tables or zigzag nesting.
 */

export const get_mutation_batches = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[]
): MutationBatchObject => {
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
            const table = path_to_table(mutation_piece.path)
            const record = mutation_piece.record
            // these are the graph child indices that define the ordering of the
            // toposort - parents in the toposort graph must come before children
            let child_indices: number[] = []

            mutation_plan_constraints.forEach(constraint => {
                const new_piece_indices = get_constraint_results(
                    orma_schema,
                    fk_index,
                    constraint,
                    table,
                    record
                )
                new_piece_indices.forEach(new_piece_index => {
                    // ignore self referential records
                    if (new_piece_index !== piece_index) {
                        child_indices.push(new_piece_index)
                    }
                })
            })

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
        const table = path_to_table(path)
        const from_columns = new Set(
            get_all_edges(table, orma_schema).map(edge => edge.from_columns)
        )
        from_columns.forEach(from_column => {
            // ignore non-updated columns since no cases require them to be checked
            if (
                record.$operation === 'update' &&
                !is_column_updated_for_mutation_plan(
                    orma_schema,
                    table,
                    from_column,
                    record
                )
            ) {
                return
            }
            const value = record[from_column]
            if (value !== undefined) {
                set_fk_index(
                    fk_index,
                    record_index,
                    table,
                    from_column,
                    record.$operation,
                    value
                )
            }
        })
    })

    return fk_index
}

export const is_column_updated_for_mutation_plan = (
    orma_schema: OrmaSchema,
    table: string,
    column: string,
    record: Record<string, any> & { $identifying_columns?: string[] }
) => {
    // returning false optimizes the mutation plan by excluding this column if it is being used
    // as an identifying column or otherwise not being updated. If unsure, this should return
    // true since that just adds more constraints to the mutation plan which might make it
    // go slower by adding more stages, but will never result in an error. Returning false
    // when its not supposed to might merge states that should be separate and so
    // cause an error.

    if (record[column] === undefined) {
        return false
    }

    // since the macro that puts in $read and $write guids did not run yet, there are cases where
    // there is an ambiguous identifying columns that will be resolved once one of them are marked
    // as a $write guid which disqualifies that column. In this case, the identifying columns will
    // be empty, and we just return the safe option of true from this function. If there are
    // non-ambiguous identifying columns however, they shouldn't change after this point so its
    // safe to rely on them to optimize the mutation plan
    const identifying_columns =
        record.$identifying_columns ??
        get_identifying_columns(orma_schema, table, record, false)

    // guids (which at this stage are not marked $read or $write) could later become a write guid (which would
    // not be a valid identifying column, and so would cause it to actually be an updated column),
    // so we need to be safe and not optimize them out of the constraint graph
    const identifying_columns_are_guids = identifying_columns.some(
        column => record[column]?.$guid !== undefined
    )
    if (
        identifying_columns.length &&
        identifying_columns.includes(column) &&
        !identifying_columns_are_guids
    ) {
        return false
    }

    return true
}

const get_constraint_results = (
    orma_schema: OrmaSchema,
    fk_index: FkIndex,
    constraint: MutationPlanConstraint,
    table: string,
    record: Record<string, any> & { $operation: MutationOperation | 'upsert' }
): number[] => {
    const edges =
        constraint.target_filter.connection_type === 'child'
            ? get_child_edges(table, orma_schema)
            : get_parent_edges(table, orma_schema)
    const new_piece_indices = edges.flatMap(edge => {
        if (
            !constraint.source_filter({
                orma_schema,
                edge,
                table,
                record
            })
        ) {
            return []
        }

        return constraint.target_filter.operations.flatMap(target_operation => {
            const table_column_operation_string = `${edge.to_table},${edge.to_columns},${target_operation}`
            // perform exact match or any value lookups for the target record based on the fk index
            const value = record[edge.from_columns]
            const value_string = get_value_string(value)
            if (constraint.target_filter.foreign_key_filter === 'exact_match') {
                const new_piece_indices =
                    fk_index?.[table_column_operation_string]?.[value_string] ??
                    []
                return new_piece_indices
            } else if (
                constraint.target_filter.foreign_key_filter === 'no_match'
            ) {
                // any value lookup
                const piece_indices_by_value =
                    fk_index[table_column_operation_string] ?? {}

                // no_match type is only for foreign keys that dont match (check examples).
                // for no_match, we assume $guids are $read and not making any change, and so ignore them
                // (this isnt necessarily true, but not doing this can cause unnecessary constraints that make
                // cycles in the toposort so we make this assumption for now. Really we would want to know if the
                // $guid is read or write, and only make a constraint in the write case.)

                const key_guid_string = '{"$guid":'
                const new_piece_indices = Object.keys(piece_indices_by_value)
                    .filter(
                        key =>
                            key !== value_string &&
                            !key?.startsWith(key_guid_string) &&
                            !value_string?.startsWith(key_guid_string)
                    )
                    .map(key => piece_indices_by_value[key])
                    .flat()
                return new_piece_indices
            } else {
                throw new Error('Unknown foreign_key_filter type')
            }
        })
    })

    return new_piece_indices
}

const set_fk_index = (
    fk_index: FkIndex,
    piece_index: number,
    table: string,
    column: string,
    operation: MutationOperation | 'upsert',
    value: any
) => {
    const table_column_operation_string = `${table},${column},${operation}`
    const value_string = get_value_string(value)
    if (!fk_index[table_column_operation_string]) {
        fk_index[table_column_operation_string] = {}
    }

    if (!fk_index[table_column_operation_string][value_string]) {
        fk_index[table_column_operation_string][value_string] = []
    }
    fk_index[table_column_operation_string][value_string].push(piece_index)
}

const get_value_string = value =>
    // dont include $read or $write props in guids
    JSON.stringify(value?.$guid ? { $guid: value.$guid } : value)

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
            end_index: start_index + toposort_tier.length
        })
    })

    return { mutation_pieces, mutation_batches }
}

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
            mutation_batch
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

/**
 * The wierd index format is because the constraints so far need two types of lookups:
 *   1. Lookup a specific table, column, operation and value combo
 *   2. Lookup a specific table, column and operation but get all values
 * This format handles those cases while minimizing the number of new objects (better to have as many of
 * the lookup props combined in a string as possible, so we dont have so many nested objects and arrays
 * which would allocate more things to the heap). This index is made for the whole mutation, so
 * we do want to optimize it. Also this format means less deep getting and setting, which is nice.
 */
type FkIndex = {
    [table_column_operation_string: string]: {
        [value_string: string]: number[]
    }
}

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

type MutationBatchObject = {
    mutation_pieces: MutationPiece[]
    mutation_batches: MutationBatch[]
}
