import { group_by } from '../../helpers/helpers'
import { hexoid } from '../../helpers/hexoid'
import {
    Edge,
    get_direct_edges,
    get_primary_keys,
    is_parent_table
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../schema/schema_types'
import { path_to_table } from '../helpers/mutate_helpers'
import { NestingMutationOutput } from './nesting_mutation_macro'

// 1000 ids / sec needs 21 billion years for 1% chance of collision
// https://alex7kom.github.io/nano-nanoid-cc/?alphabet=0123456789abcdef&size=36&speed=1000&speedUnit=second
const get_id = hexoid(36)

/**
 * MUTATES THE INPUT. Adds guids to foreign keys of records that are adjacent in the mutation json object. We apply
 * inference in 3 cases: 2 creates that are adjacent in the json object, 2 deletes that
 * are adjacent or an update adjacent to a create. We only do inference where we would not overwrite user supplied data. As a special precaution,
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
    orma_schema: OrmaSchema,
    mutation_pieces: NestingMutationOutput
) => {
    mutation_pieces.forEach(child_mutation_piece => {
        const connected_mutation_pieces = [
            ...(child_mutation_piece.higher_index !== undefined
                ? [mutation_pieces[child_mutation_piece.higher_index]]
                : []),
            ...child_mutation_piece.lower_indices.map(
                lower_index => mutation_pieces[lower_index]
            )
        ]

        const child_table = path_to_table(child_mutation_piece.path)
        const child_record = child_mutation_piece.record
        const all_parent_mutation_pieces = connected_mutation_pieces.filter(
            mutation_piece => {
                const parent_table = path_to_table(mutation_piece.path)
                const is_parent = is_parent_table(
                    parent_table,
                    child_table,
                    orma_schema
                )
                return is_parent
            }
        )

        const parent_mutation_pieces_by_table = group_by(
            all_parent_mutation_pieces,
            mutation_piece => path_to_table(mutation_piece.path)
        )

        Object.keys(parent_mutation_pieces_by_table).forEach(parent_table => {
            const parent_mutation_pieces =
                parent_mutation_pieces_by_table[parent_table]

            const edges_to_child = get_direct_edges(
                parent_table,
                child_table,
                orma_schema
            )

            if (!can_apply_inference(parent_mutation_pieces, edges_to_child)) {
                return
            }

            // we now know that there is only one edge and mutation piece for this table
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

            infer_guid(parent_record, child_record, edge_to_child, guid_obj)
        })

        // if the primary keys dont have $guids or values yet, add a $guid. This $guid wont connect to any
        // foreign key, it will only be used to add the primary keys to the mutation later on. We want this
        // because it is usefull to guarantee that the primary keys are in scope when processing the mutation
        // results
        const primary_keys = get_primary_keys(child_table, orma_schema)
        primary_keys.forEach(key => {
            if (child_record[key] === undefined) {
                child_record[key] = { $guid: get_id() }
            }
        })
    })
}

/**
 * Checks that guids can be inferred unambiguously
 */
const can_apply_inference = (
    parent_mutation_pieces: NestingMutationOutput,
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
    const parent_op = parent_record.$operation
    const child_op = child_record.$operation

    // there could be more cases where we want to apply guid inference (what create nested under delete?)
    // but these are the ones I'm sure of for now

    const both_deletes = parent_op === 'delete' && child_op === 'delete'

    /* 
    - nested creates is straightforward propagation, such as create a user with a post.
    - created child and updated parent is like update a user and create a post with that user id.
    - created parent and updated child is like creating an optional parent (i.e. nullable foreign key)
        for an existing child. Since we do foreign key propagation, the child foreign key will be updated 
        to point to the newly created parent 
    - updated parent and updated child is like updating a user and updating a post nested inside the user.
        in this case, the post's user id will be updated to point at the updated user. This can also be useful
        because the guid means you can update a child by part of a combo unique key, assuming the other part
        is filled in by the guid. For example, this mutation is valid:
            {
                posts: [{ 
                    $operation: 'update',
                    id: 1,
                    post_has_categories: [{
                        category_id: 1,
                        main_category: true
                    }]
                }]
            }
        even though category_id is not a unique key on its own, because there is a guid on post_id, only
        providing category_id is enough to identify the post_has_category
    - a deleted child and updated parent is useful in a similar way to nested updates. You can delete the child
        based on a lookup on the updated parent.
    - an upsert will always resolve to either a create or an update, so replacing any operation with upsert
        in one of the previous cases, will be like replacing it with update or create, meaning all combinations
        of create, update or upsert are accounted for.
    */
    const create_or_update_operations = ['create', 'update', 'upsert']
    const both_creates_or_updates =
        create_or_update_operations.includes(parent_op) &&
        create_or_update_operations.includes(child_op)
    const deleted_child_updated_parent =
        child_op === 'delete' && parent_op === 'update'

    const valid_operations =
        both_creates_or_updates || both_deletes || deleted_child_updated_parent

    // we dont do foreign key inference if the foreign key (e.g. parent_id) has something
    // provided by the user, even if the parent (e.g. id) is empty. We could propagate to the
    // parent column in this case, but this will probably lead to bugs such as the id column
    // being changed if it is a guid and another unique column has a value, which would
    // accidentally set the id which we definitely dont want. So as a precaution we
    // dont propagate. We still propagate if the parent column is given by the user but not
    // the child column, for example nested deletes where only the id is given.
    const child_value_is_undefined =
        child_record[edge_to_child.to_columns] === undefined

    const should_apply = valid_operations && child_value_is_undefined

    return should_apply
}

const infer_guid = (
    parent_record: Record<string, any>,
    child_record: Record<string, any>,
    edge_to_child: Edge,
    guid_obj: { $guid: any }
) => {
    const { from_columns: from_column, to_columns: to_column } = edge_to_child

    if (parent_record[from_column] === undefined) {
        // use same reference since there is only one higher record
        parent_record[from_column] = guid_obj
    }

    // copy so we dont share references. Each lower record gets its own copy
    const lower_value =
        typeof parent_record[from_column] === 'object'
            ? { ...parent_record[from_column] }
            : parent_record[from_column]

    child_record[to_column] = lower_value
}
