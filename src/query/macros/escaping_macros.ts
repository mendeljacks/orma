import { deep_for_each, deep_set, is_simple_object } from '../../helpers/helpers'

export const apply_escaping_macro = (
    query,
    escaping_function: (value, path: (string | number)[]) => any
) => {
    let raw_paths = []

    deep_for_each(query, (value, path) => {
        const is_primitive = !is_simple_object(value) && !Array.isArray(value)
        if (is_primitive) {
            // dont escape if the value is a descendant of a $raw object
            if (path.findIndex(el => el === '$raw') === -1) {
                deep_set(path, escaping_function(value, path), query)
            }
        }

        if (value?.$raw) {
            raw_paths.push([path, value])
        }
    })

    // reverse order so we process from lowest to highest keys so mutations
    // dont invalidate lower paths
    raw_paths.reverse()

    raw_paths.forEach(([path, value]) => {
        if (path.length === 0) {
            // cant set root object directly, so we use this hack
            if (is_simple_object(value.$raw)) {
                const $raw = value.$raw
                delete query.$raw
                Object.keys($raw).forEach(key => query[key] = $raw[key])
            } else {
                throw new Error('Can\'t use the $raw keyword on the root with a non-object as its value')
            }
        }
        deep_set(path, value.$raw, query)
    })
}

export const apply_field_macro = query => {
    deep_for_each(query, (value, path) => {
        if (value?.$field !== undefined) {
            value.$raw = value.$field
            delete value.$field
        }
    })
}
