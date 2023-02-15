import { orma_escape } from '../../helpers/escape'
import { deep_for_each, deep_set, last } from '../../helpers/helpers'
import { OrmaSchema } from '../../types/schema/schema_types'
import { get_real_entity_name } from '../query'
import { get_any_path_context_entity } from './any_path_macro'

export const apply_escape_macro = (query, orma_schema: OrmaSchema) => {
    apply_escape_macro_to_query_part(orma_schema, undefined, query)
}

// can be used to escape only parts of queries, for example only escaping a $where clause
export const apply_escape_macro_to_query_part = (
    orma_schema: OrmaSchema,
    root_entity: string | undefined,
    query
) => {
    let raw_paths: any[] = []

    deep_for_each(query, (value, path) => {
        if (value?.$escape !== undefined) {
            raw_paths.push([path, value])
        }
    })

    // reverse order so we process from lowest to highest keys so mutations
    // dont invalidate lower paths
    raw_paths.reverse()

    raw_paths.forEach(([path, value]) => {
        if (path.length === 0) {
            if (path.length === 0) {
                throw new Error("Can't use the $escape keyword on the root.")
            }
        }

        const entity = get_any_path_context_entity(path, query) ?? root_entity

        deep_set(
            path,
            orma_escape(
                value.$escape,
                orma_schema.$entities[entity].$database_type
            ),
            query
        )
    })
}
