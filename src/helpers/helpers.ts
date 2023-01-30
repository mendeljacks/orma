import { Path } from '../types'

type type_string =
    | 'Object'
    | 'Number'
    | 'Boolean'
    | 'String'
    | 'Null'
    | 'Array'
    | 'RegExp'
    | 'Function'
    | 'Undefined'
export const type = (value: any): type_string => {
    return value === null
        ? 'Null'
        : value === undefined
        ? 'Undefined'
        : Object.prototype.toString.call(value).slice(8, -1)
}
export const drop_last = (num: number, arr: any[]) => arr.slice(0, -num)
export const last = <T>(array: T[]): T => array[array.length - 1]
export const deep_set = (
    path_array: (string | number)[],
    value: any,
    obj: any
): void => {
    if (path_array.length === 0) return obj

    let pointer = obj

    for (let i = 0; i < path_array.length; i++) {
        const path_el = path_array[i]
        const next_path_el =
            i !== path_array.length - 1 ? path_array[i + 1] : undefined

        const next_el_default = type(next_path_el) === 'Number' ? [] : {}

        const is_array = Array.isArray(pointer)
        const is_object = is_simple_object(pointer)

        // if (is_array && type(path_el) !== 'Number') {
        //     throw new Error('Trying to path into an array without a number index')
        // }

        const contains_path_el = is_array
            ? path_el < pointer.length
            : is_object
            ? path_el in pointer
            : false

        if (!contains_path_el) {
            if (is_array) {
                const items_to_add = new Array(
                    Number(path_el) - pointer.length
                ).map(el => undefined)
                pointer.push(...items_to_add)
            }

            pointer[path_el] = next_el_default
        }

        const child_is_primitive =
            !is_simple_object(pointer[path_el]) &&
            !Array.isArray(pointer[path_el])
        if (!contains_path_el || child_is_primitive) {
            pointer[path_el] = next_el_default
        }

        if (i === path_array.length - 1) {
            pointer[path_el] = value
        }

        pointer = pointer[path_el]
    }
}

// from https://stackoverflow.com/a/16608074
export const is_simple_object = val =>
    !!val &&
    (val.constructor === Object || val.constructor?.name === 'RowDataPacket')

export const deep_get = (
    path_array: (string | number)[],
    obj: any,
    default_value: any = undefined
): any => {
    let pointer = obj

    for (const path_el of path_array) {
        const is_array = Array.isArray(pointer)
        const is_object = is_simple_object(pointer)

        // if (is_array && type(path_el) !== 'Number') {
        //     throw new Error('Trying to path into an array without a number index')
        // }

        const contains_path_el = is_array
            ? path_el < pointer.length
            : is_object
            ? path_el in pointer
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

/**
 * Like a map, but works on deeply nested objects and arrays. Processor function runs on a depth first search, i.e.
 * the processor will only be called on an element after it has been called on all the children.
 * @param item can be an object or array
 * @param processor this function will run on every object, array and primitive value found
 * @returns the mapped object
 */
export const deep_map = (
    item: any,
    processor: (value: any, path: (string | number)[]) => any,
    current_path: any[] = []
) => {
    let mapped_item
    if (Array.isArray(item)) {
        mapped_item = item.map((el, i) => {
            const new_path: any[] = [...current_path, i]
            const subitem = deep_map(el, processor, new_path)
            return subitem
        })
    } else if (is_simple_object(item)) {
        mapped_item = Object.keys(item).reduce((acc, key) => {
            const new_path = [...current_path, key]
            const subitem = deep_map(item[key], processor, new_path)
            acc[key] = subitem
            return acc
        }, {})
    } else {
        mapped_item = item
    }

    return processor(mapped_item, current_path)
}

// calls fn on every object in input array. Also moves into any arrays it finds and calls
// walk recursively on those.
// fn is a function of (object, path_to_object) -> null
/**
 * Calls the processor on every object and array for deeply nested objects/arrays. Processort runs from the least deeply nested keys to the most deeply nested ones
 * Does not run on leaf keys (i.e. where value of key is not an object or array)
 * @param item
 * @param processor
 * @param current_path
 */
export const deep_for_each = (
    item: any,
    processor: (value: any, path: (string | number)[]) => void,
    current_path: any[] = []
) => {
    const is_object = is_simple_object(item)
    const is_array = Array.isArray(item)
    const is_primitive = !is_object && !is_array

    if (is_object) {
        processor(item, current_path)
        for (const prop in item) {
            deep_for_each(item[prop], processor, [...current_path, prop])
        }
    }

    if (is_array) {
        processor(item, current_path)
        item.forEach((el, i) => {
            deep_for_each(el, processor, [...current_path, i])
        })
    }

    if (is_primitive) {
        processor(item, current_path)
    }
}

/*
  From https://github.com/angus-c/just/blob/master/packages/collection-clone/index.js

  Deep clones all properties except functions
  var arr = [1, 2, 3];
  var subObj = {aa: 1};
  var obj = {a: 3, b: 5, c: arr, d: subObj};
  var objClone = clone(obj);
  arr.push(4);
  subObj.bb = 2;
  obj; // {a: 3, b: 5, c: [1, 2, 3, 4], d: {aa: 1}}
  objClone; // {a: 3, b: 5, c: [1, 2, 3], d: {aa: 1, bb: 2}}
*/

export const clone = <T>(obj: T): T => {
    if (typeof obj == 'function') {
        return obj
    }
    var result = Array.isArray(obj) ? [] : {}
    for (var key in obj) {
        // include prototype properties
        var value = obj[key]
        var type = {}.toString.call(value).slice(8, -1)
        if (type == 'Array' || type == 'Object') {
            //@ts-ignore
            result[key] = clone(value)
        } else if (type == 'Date') {
            //@ts-ignore
            result[key] = new Date(value.getTime())
        } else if (type == 'RegExp') {
            //@ts-ignore
            result[key] = RegExp(value.source, getRegExpFlags(value))
        } else {
            //@ts-ignore
            result[key] = value
        }
    }
    //@ts-ignore
    return result
}

function getRegExpFlags(regExp) {
    if (typeof regExp.source.flags == 'string') {
        return regExp.source.flags
    } else {
        var flags: string[] = []
        regExp.global && flags.push('g')
        regExp.ignoreCase && flags.push('i')
        regExp.multiline && flags.push('m')
        regExp.sticky && flags.push('y')
        regExp.unicode && flags.push('u')
        return flags.join('')
    }
}

export const group_by = <T>(
    array: T[],
    key_function: (item: T, i: number) => string
): Record<string, T[]> =>
    array.reduce((acc, item, i) => {
        const key = key_function(item, i)
        if (!acc[key]) {
            acc[key] = []
        }

        acc[key].push(item)
        return acc
    }, {})

/**
 * Overwrites items that give the same value for key_function
 */
export const key_by = <T>(
    array: T[],
    key_function: (item: T, i: number) => string
): Record<string, T> =>
    array.reduce((acc, item, i) => {
        const key = key_function(item, i)

        acc[key] = item
        return acc
    }, {})

export const array_equals = (array1: any[], array2: any[]) =>
    array1.length === array2.length &&
    array1.every((el1, i) => el1 === array2[i])

// from: https://stackoverflow.com/a/69424269
/**
 * Tests whether two values are deeply equal using same-value equality.
 *
 * Two values are considered deeply equal iff 1) they are the same value, or
 * 2) they are both non-callable objects whose own, enumerable, string-keyed
 * properties are deeply equal.
 *
 * Caution: This function does not fully support circular references. Use this
 * function only if you are sure that at least one of the arguments has no
 * circular references.
 */
export function deep_equal(x, y) {
    // check primitive values
    if (
        typeof x !== 'object' ||
        x === null ||
        typeof y !== 'object' ||
        y === null
    ) {
        return Object.is(x, y)
    }

    if (x === y) {
        return true
    }

    const keys = Object.keys(x)
    if (Object.keys(y).length !== keys.length) return false

    for (const key of keys) {
        if (
            !Object.prototype.propertyIsEnumerable.call(y, key) ||
            !deep_equal(x[key], y[key])
        ) {
            return false
        }
    }

    return true
}

export const force_array = <T>(param: T | T[]) =>
    Array.isArray(param) ? param : [param]

export const has_prop = (prop, obj) => {
    return Object.prototype.hasOwnProperty.call(obj, prop)
}

/**
 * Return items in array 1 but not array 2
 */
export const difference = <T>(array_1: T[], array_2: any[]) => {
    const array_2_set = new Set(array_2)
    return array_1.filter(el => !array_2_set.has(el))
}

export const map_object = <
    InObj extends Record<any, any>,
    OutKey extends string,
    OutValue
>(
    obj: InObj,
    fn: (
        key: keyof InObj,
        value: InObj[keyof InObj],
        index: number
    ) => [Key: OutKey, Value: OutValue]
) =>
    Object.fromEntries(
        Object.entries(obj).map(([k, v], i) => fn(k, v, i))
    ) as Record<OutKey, OutValue>

export const is_nill = (el: any): el is null | undefined =>
    el === null || el === undefined