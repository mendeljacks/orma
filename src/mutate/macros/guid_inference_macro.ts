import hexoid from 'hexoid'
import { clone } from '../../helpers/helpers'
import {
    Edge,
    get_direct_edges,
    is_parent_entity,
    reverse_edge,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { mutation_entity_deep_for_each } from '../helpers/mutate_helpers'

// 1000 ids / sec needs 21 billion years for 1% chance of collision
// https://alex7kom.github.io/nano-nanoid-cc/?alphabet=0123456789abcdef&size=36&speed=1000&speedUnit=second
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
        (higher_record, higher_path, higher_entity) => {
            Object.keys(higher_record).forEach(lower_entity => {
                if (Array.isArray(higher_record[lower_entity])) {
                    const edges_to_lower_entity = get_direct_edges(
                        higher_entity,
                        lower_entity,
                        orma_schema
                    )
                    

                    // if we can't infer a single foreign key, then we just skip this,
                    // assuming there will be $guids already supplied by the user or validation would
                    // reject the mutation
                    if (edges_to_lower_entity.length === 1) {
                        const edge_to_lower_entity = edges_to_lower_entity[0]

                        const guid_obj = { $guid: get_id() }

                        higher_record[lower_entity].forEach(lower_record => {
                            if (
                                should_apply_inference(
                                    lower_record,
                                    higher_record,
                                    edge_to_lower_entity,
                                    orma_schema
                                )
                            ) {
                                const [
                                    parent_record,
                                    child_record,
                                    edge_to_child,
                                ] = is_parent_entity(
                                    higher_entity,
                                    lower_entity,
                                    orma_schema
                                )
                                    ? [
                                          higher_record,
                                          lower_record,
                                          edge_to_lower_entity,
                                      ]
                                    : [
                                          lower_record,
                                          higher_record,
                                          reverse_edge(edge_to_lower_entity),
                                      ]

                                const { from_field, to_field } = edge_to_child

                                if (parent_record[from_field] === undefined) {
                                    // use same reference since there is only one higher record
                                    parent_record[from_field] = guid_obj
                                }

                                // copy so we dont share references. Each lower record gets its own copy
                                const lower_value =
                                    typeof parent_record[from_field] ===
                                    'object'
                                        ? { ...parent_record[from_field] }
                                        : parent_record[from_field]

                                child_record[to_field] = lower_value
                            }
                        })
                    }
                }
            })
        }
    )
}

const should_apply_inference = (
    lower_record: Record<string, any>,
    higher_record: Record<string, any>,
    edge_to_lower_entity: Edge,
    orma_schema: OrmaSchema
) => {
    const { from_field, to_field, from_entity, to_entity } =
        edge_to_lower_entity

    const operations_are_same =
        lower_record.$operation === higher_record.$operation

    const is_create_or_delete =
        higher_record.$operation === 'create' ||
        higher_record.$operation === 'delete'

    // we dont do foreign key inference if the foreign key (e.g. parent_id) has something
    // provided by the user, even if the parent (e.g. id) is empty. We could propagate to the
    // parent column in this case, but this will probably lead to bugs such as the id column
    // being changed if it is a guid and another unique column has a value, which would
    // accidentally set the id which we definitely dont want. So as a precaution we
    // dont propagate. We still propagate if the parent column is given by the user but not
    // the child column, for example nested deletes where only the id is given.
    const child_value = is_parent_entity(from_entity, to_entity, orma_schema)
        ? lower_record[to_field]
        : higher_record[from_field]

    const should_apply =
        operations_are_same && is_create_or_delete && child_value === undefined

    return { should_apply }
}
