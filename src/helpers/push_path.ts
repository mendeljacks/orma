import { deep_get, deep_set } from './helpers'

/**
 * Push values to arrays which are deeply nested
 */
export const push_path = (path_to_arr, val, obj) => {
    const current_value = deep_get(path_to_arr, obj, null)
    if (!Array.isArray(current_value)) {
        deep_set(path_to_arr, [val], obj)
    } else {
        deep_get(path_to_arr, obj).push(val)
    }


    return obj
}