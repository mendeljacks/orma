type type_string = 'Object' | 'Number' | 'Boolean' | 'String' | 'Null' | 'Array' | 'RegExp' | 'Function' | 'Undefined'
export const type = (value: any): type_string => {
    return value === null
        ? 'Null'
        : value === undefined
            ? 'Undefined'
            : Object.prototype.toString.call(value).slice(8, -1);
}
export const drop = (num: number, arr: any[]) => arr.slice(0, -num)
export const last = <T>(array: T[]): T => array[array.length - 1]
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

/**
 * Like a map, but works on deeply nested objects and arrays. Processor function runs on a depth first search, i.e. 
 * the processor will only be called on an element after it has been called on all the children.
 * @param item can be an object or array
 * @param processor this function will run on every object, array and primitive value found
 * @returns the mapped object
 */
export const deep_map = (item: any, processor: (value: any, path: (string | number)[]) => any, current_path = []) => {
    let mapped_item
    if (Array.isArray(item)) {
        mapped_item = item.map((el, i) => {
            const new_path = [...current_path, i]
            const subitem = deep_map(el, processor, new_path)
            return subitem
        })
    } else if (typeof item === 'object') {
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
export const deep_for_each = (item: any, processor: (value: any, path: (string | number)[]) => void, current_path = []) => {
    const is_object = typeof item === 'object' && !Array.isArray(item) && item !== null && !(item instanceof Date) 
    const is_array = typeof item === 'object' && Array.isArray(item)
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

export const get_lower_paths = (item: Record<any, any> | any[], path: (string | number)[]) => {
    const keys = Array.isArray(item) 
        ? item.map((_, i) => [...path, i])
        : Object.keys(item)
    
    return keys.map(key => [...path, key])
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

export const clone = (obj) => {
    if (typeof obj == 'function') {
        return obj;
    }
    var result = Array.isArray(obj) ? [] : {};
    for (var key in obj) {
        // include prototype properties
        var value = obj[key];
        var type = {}.toString.call(value).slice(8, -1);
        if (type == 'Array' || type == 'Object') {
            result[key] = clone(value);
        } else if (type == 'Date') {
            result[key] = new Date(value.getTime());
        } else if (type == 'RegExp') {
            result[key] = RegExp(value.source, getRegExpFlags(value));
        } else {
            result[key] = value;
        }
    }
    return result;
}

function getRegExpFlags(regExp) {
    if (typeof regExp.source.flags == 'string') {
        return regExp.source.flags;
    } else {
        var flags = [];
        regExp.global && flags.push('g');
        regExp.ignoreCase && flags.push('i');
        regExp.multiline && flags.push('m');
        regExp.sticky && flags.push('y');
        regExp.unicode && flags.push('u');
        return flags.join('');
    }
}