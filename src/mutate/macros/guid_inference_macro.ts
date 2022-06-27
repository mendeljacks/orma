import * as hexoid from 'hexoid'
import { group_by } from '../../helpers/helpers'
import {
    Edge,
    get_direct_edges,
    is_parent_entity
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import {
    get_connected_mutation_pieces,
    mutation_entity_deep_for_each,
    path_to_entity
} from '../helpers/mutate_helpers'
import { MutationPiece } from '../plan/mutation_plan'

// 1000 ids / sec needs 21 billion years for 1% chance of collision
// https://alex7kom.github.io/nano-nanoid-cc/?alphabet=0123456789abcdef&size=36&speed=1000&speedUnit=second
// @ts-ignore
const get_id = hexoid(36)

/**
 * MUTATES THE INPUT. Adds guids to foreign keys of records that are adjacent in the mutation json object. We apply
 * inference in two cases: 2 creates that are adjacent in the json object, or 2 deletes that
 * are adjacent. We only do inference where we would not overwrite user supplied data. As a special precaution,
 * if the user already supplied a child foreign key (e.g. parent_id column) we skip inference. The final decision
 * table looks like this:
 *
 *  child/parent |     none      |       guid        |      value
 * --------------|---------------|-------------------|------------------
 *  none         | generate guid | clone parent guid | copy parent guid
 *  guid         | ignore        | ignore            | ignore
 *  value        | ignore        | ignore            | ignore
 */
export const apply_guid_inference_macro = (
    mutation,
    orma_schema: OrmaSchema
) => {
    mutation_entity_deep_for_each(
        mutation,
        (child_record, child_path, child_entity) => {
            const child_mutation_piece: MutationPiece = {record: child_record, path: child_path}
            const all_parent_mutation_pieces = get_connected_mutation_pieces(
                mutation,
                child_mutation_piece
            ).filter(mutation_piece => {
                const parent_entity = path_to_entity(mutation_piece.path)
                const is_parent = is_parent_entity(
                    parent_entity,
                    child_entity,
                    orma_schema
                )
                return is_parent
            })

            const parent_mutation_pieces_by_entity = group_by(
                all_parent_mutation_pieces,
                mutation_piece => path_to_entity(mutation_piece.path)
            )

            Object.keys(parent_mutation_pieces_by_entity).forEach(
                parent_entity => {
                    const parent_mutation_pieces =
                        parent_mutation_pieces_by_entity[parent_entity]

                    const edges_to_child = get_direct_edges(
                        parent_entity,
                        child_entity,
                        orma_schema
                    )

                    if (
                        !can_apply_inference(
                            parent_mutation_pieces,
                            edges_to_child
                        )
                    ) {
                        return
                    }

                    // we now know that there is only one edge and mutation piece for this entity
                    const edge_to_child = edges_to_child[0]
                    const { record: parent_record, path: parent_path } =
                        parent_mutation_pieces[0]

                    const guid_obj = { $guid: get_id() }

                    if (
                        !should_apply_inference(
                            parent_record,
                            child_record,
                            edge_to_child
                        )
                    ) {
                        return
                    }

                    infer_guid(
                        parent_record,
                        child_record,
                        edge_to_child,
                        guid_obj
                    )
                }
            )
        }
    )
}

/**
 * Checks that guids can be inferred unambiguously
 */
const can_apply_inference = (
    parent_mutation_pieces: MutationPiece[],
    edges_to_child: Edge[]
) => {
    // this is an unsupported usecase if the user doesn't supply their own guids.
    // verification should handle this error in that case
    const one_parent = parent_mutation_pieces.length === 1

    // if we can't infer a single foreign key, then we just skip this,
    // assuming there will be $guids already supplied by the user or validation would
    // reject the mutation
    const one_edge = edges_to_child.length === 1

    return one_parent && one_edge
}

/**
 * Checks that we want to infer a guid
 */
const should_apply_inference = (
    parent_record: Record<string, any>,
    child_record: Record<string, any>,
    edge_to_child: Edge
) => {
    const operations_are_same =
        parent_record.$operation === child_record.$operation

    const is_create_or_delete =
        parent_record.$operation === 'create' ||
        parent_record.$operation === 'delete'

    // we dont do foreign key inference if the foreign key (e.g. parent_id) has something
    // provided by the user, even if the parent (e.g. id) is empty. We could propagate to the
    // parent column in this case, but this will probably lead to bugs such as the id column
    // being changed if it is a guid and another unique column has a value, which would
    // accidentally set the id which we definitely dont want. So as a precaution we
    // dont propagate. We still propagate if the parent column is given by the user but not
    // the child column, for example nested deletes where only the id is given.
    const child_value_is_undefined =
        child_record[edge_to_child.to_field] === undefined

    const should_apply =
        operations_are_same && is_create_or_delete && child_value_is_undefined

    return should_apply
}

const infer_guid = (
    parent_record: Record<string, any>,
    child_record: Record<string, any>,
    edge_to_child: Edge,
    guid_obj: { $guid: any }
) => {
    const { from_field, to_field } = edge_to_child

    if (parent_record[from_field] === undefined) {
        // use same reference since there is only one higher record
        parent_record[from_field] = guid_obj
    }

    // copy so we dont share references. Each lower record gets its own copy
    const lower_value =
        typeof parent_record[from_field] === 'object'
            ? { ...parent_record[from_field] }
            : parent_record[from_field]

    child_record[to_field] = lower_value
}
