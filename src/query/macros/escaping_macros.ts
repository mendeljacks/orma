import {
    deep_for_each,
    deep_set
} from '../../helpers/helpers'

export const apply_escape_macro = (
    query,
    escaping_function: (value) => any
) => {
    let raw_paths = []

    deep_for_each(query, (value, path) => {
        if (value?.$escape) {
            raw_paths.push([path, value])
        }
    })

    // reverse order so we process from lowest to highest keys so mutations
    // dont invalidate lower paths
    raw_paths.reverse()

    raw_paths.forEach(([path, value]) => {
        if (path.length === 0) {
            if (path.length === 0) {
                throw new Error(
                    "Can't use the $escape keyword on the root."
                )
            }
        }
        deep_set(path, escaping_function(value.$escape), query)
    })
}