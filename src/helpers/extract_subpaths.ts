import { deep_get } from './helpers'

/**
 *
 * @param template_path An array representing subpaths to collect where 0 is the placeholder for array indices
 * @param obj An object to collect subpaths from
 * @example
 *  const subpaths = extract_subpaths([0,'variants',0], products)
 */
export const extract_subpaths = (template_path, obj) => {
    let subpaths: any[] = []
    const get_subpaths_recursive = (
        path_template,
        obj,
        recursion_depth = 0,
        current_path: any[] = []
    ) => {
        if (recursion_depth === path_template.length) {
            subpaths.push(current_path)
        } else if (path_template[recursion_depth] === 0) {
            ;(deep_get(current_path, obj) || []).forEach((el, i) =>
                get_subpaths_recursive(
                    path_template,
                    obj,
                    recursion_depth + 1,
                    [...current_path, i]
                )
            )
        } else {
            get_subpaths_recursive(path_template, obj, recursion_depth + 1, [
                ...current_path,
                path_template[recursion_depth],
            ])
        }
    }
    get_subpaths_recursive(template_path, obj, 0, [])
    return subpaths
}
