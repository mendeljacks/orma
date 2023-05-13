import { deep_get, drop_last } from '../../helpers/helpers'
import { get_direct_edge, get_direct_edges, is_parent_entity } from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../types/schema/schema_types'
import { is_submutation, path_to_entity } from './mutate_helpers'

/**
 * Gets all the foreign key edges for a specific location in a mutation. Returned edges will be all edges from
 * the given location to a connected location in the mutation that are from child -> parent.
 */
export const get_foreign_keys_in_mutation = (
    mutation,
    record_path: (string | number)[],
    orma_schema: OrmaSchema
) => {
    const entity_name = path_to_entity(record_path)
    const record = deep_get(record_path, mutation)

    // get a list of the above path, as well as any below paths.
    // Some of these might by parents and some might be children.
    const above_path = drop_last(2, record_path)
    const below_paths = Object.keys(record)
        .filter(key => is_submutation(record, key))
        .map(key => [...record_path, key, 0])
    const all_paths = [above_path, ...below_paths]

    const foreign_keys = all_paths.flatMap(parent_path => {
        const parent_entity_name = parent_path?.[parent_path.length - 2]
        // dont do anything for the child paths (foreign keys only come from parents by definition)
        if (!is_parent_entity(parent_entity_name, entity_name, orma_schema)) {
            return []
        }

        const edges = get_direct_edges(
            entity_name,
            parent_entity_name,
            orma_schema
        )

        return edges.map(edge => ({
            parent_path,
            edge,
        }))
    })

    return foreign_keys
}
