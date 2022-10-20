import { orma_escape } from '../../helpers/escape'
import { deep_for_each, deep_set, last } from '../../helpers/helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { get_real_entity_name } from '../query'
import { get_any_path_context_entity } from './any_path_macro'

export const apply_escape_macro = (query, orma_schema: OrmaSchema) => {
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

        const entity = get_real_entity_name(
            get_any_path_context_entity(path, query),
            value
        )
        deep_set(
            path,
            orma_escape(value.$escape, orma_schema[entity].$database_type),
            query
        )
    })
}
