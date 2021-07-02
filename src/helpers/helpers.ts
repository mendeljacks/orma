type type_string = 'Object' | 'Number' | 'Boolean' | 'String' | 'Null' | 'Array' | 'RegExp' | 'Function' | 'Undefined'
export const type = (value: any): type_string => {
    return value === null
        ? 'Null'
        : value === undefined
            ? 'Undefined'
            : Object.prototype.toString.call(value).slice(8, -1);
}
export const drop_last = (arr) => arr.slice(0,-1)
export const last = (arr) => arr[arr.length - 1]
export const deep_set = (path_array: (string | number)[], value: any, obj: any): void => {
    if (path_array.length === 0) return obj

    let pointer = obj

    for (let i = 0; i < path_array.length; i++) {
        const path_el = path_array[i]
        const next_path_el = i !== path_array.length - 1
            ? path_array[i + 1]
            : undefined

        const next_el_default = type(next_path_el) === 'Number'
            ? []
            : {}

        const is_array = Array.isArray(pointer)
        const is_object = type(pointer) === 'Object'

        // if (is_array && type(path_el) !== 'Number') {
        //     throw new Error('Trying to path into an array without a number index')
        // }

        const contains_path_el =
            is_array ? path_el < pointer.length
                : is_object ? path_el in pointer
                    : false

        if (!contains_path_el) {
            if (is_array) {
                const items_to_add = new Array(Number(path_el) - pointer.length).map(el => undefined)
                pointer.push(...items_to_add)
            }

            pointer[path_el] = next_el_default
        }

        const child_type = type(pointer[path_el])
        const child_is_primitive = child_type !== 'Object' && child_type !== 'Array'
        if (!contains_path_el || child_is_primitive) {
            pointer[path_el] = next_el_default
        }

        if (i === path_array.length - 1) {
            pointer[path_el] = value
        }

        pointer = pointer[path_el]
    }
}

export const deep_get = (path_array: (string | number)[], obj: any, default_value: any = undefined): any => {
    let pointer = obj

    for (const path_el of path_array) {
        const is_array = Array.isArray(pointer)
        const is_object = type(pointer) === 'Object'

        // if (is_array && type(path_el) !== 'Number') {
        //     throw new Error('Trying to path into an array without a number index')
        // }

        const contains_path_el =
            is_array ? path_el < pointer.length
                : is_object ? path_el in pointer
                    : false

        if (contains_path_el) {
            pointer = pointer[path_el]
            continue
        } else {
            return default_value
        }
    }

    return pointer
}