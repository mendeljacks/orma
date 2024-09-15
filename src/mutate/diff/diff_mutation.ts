import { deep_equal, has_prop } from '../../helpers/helpers'
import { lir_join } from '../../helpers/lir_join'

const is_array = el => Array.isArray(el)
const is_object = el =>
    !Array.isArray(el) && typeof el === 'object' && el !== null
const is_primitive = el => !is_array(el) && !is_object(el)

export const get_mutation_diff = (original, modified) => {
    if (is_object(original) && modified === null) {
        const empty_subtables = Object.keys(original).reduce((acc, val, i) => {
            if (is_array(original[val])) {
                acc[val] = []
            }
            return acc
        }, {})

        return get_mutation_diff(original, empty_subtables)
    }

    if (
        is_primitive(modified) ||
        modified?.$guid !== undefined ||
        // this catches the case where $identifying_key is provided (since the identifying key is an array of strings)
        typeof modified?.[0] === 'string'
    ) {
        return modified
    }
    if (!is_object(original) && is_object(modified)) {
        const uo = {
            id: modified.id,
            ...get_mutation_diff({}, modified),
            $operation: 'create',
        }
        if (!uo.id) delete uo.id
        return uo
    }
    if (!is_array(original) && is_array(modified)) {
        return get_mutation_diff([], modified)
    }
    if (is_array(original) && is_array(modified)) {
        ;[...original, ...modified].forEach(el => {
            if (!is_object(el))
                throw new Error('Array elements can only contain objects')
        })

        const { left, inner, right } = lir_join(
            original,
            [] as any[],
            modified,
            x => x.id,
            (l, i, r) => {
                if (l.length !== 1 || r.length !== 1)
                    throw new Error(
                        'You must not have arrays where id is same across more than one entry eg [{id:2},{id:2}]'
                    )
                const left_obj = l[0]
                const right_obj = r[0]
                if (!deep_equal(left_obj, right_obj)) {
                    const update_obj = get_mutation_diff(left_obj, right_obj)
                    i.push(update_obj)
                }
                return i
            },
            x => x.id
        )
        left.forEach(el => {
            if (!el.id)
                throw new Error(
                    'Objects with no ids can only exist in modified objects because it is not possible to modify something that has not been created yet'
                )
        })

        return [
            ...left.map(obj => ({
                // must include obj because deletes need foreign keys so orma knows what order to delete things
                // when two records are deleted and one has a foreign key to the other. In theory we could
                // only spread on foreign key columns, but this function doesnt have the orma schema in scope
                ...obj,
                ...get_mutation_diff(obj, null),
                $operation: 'delete',
                id: obj.id,
            })),
            ...inner, // Recursively made in the inner function
            ...right.map(obj => ({
                ...get_mutation_diff(null, obj),
                $operation: 'create',
            })),
        ]
    }
    if (is_object(original) && is_object(modified)) {
        let update_obj = {}

        const original_columns = Object.keys(original)
        const modified_columns = Object.keys(modified)
        for (let i = 0; i < modified_columns.length; i++) {
            const key = modified_columns[i]
            const original_value = original[key]
            const modified_value = modified[key]

            if (!deep_equal(original_value, modified_value)) {
                update_obj['$operation'] = 'update'
                if (modified.id !== undefined) {
                    update_obj['id'] = modified.id
                }
                update_obj[key] = get_mutation_diff(
                    original_value,
                    modified_value
                )
            }
        }
        for (let i = 0; i < original_columns.length; i++) {
            const key = original_columns[i]
            if (!has_prop(key, modified)) {
                delete update_obj[key]
            }
        }

        return update_obj
    }

    throw new Error('All types must be primitives objects or arrays')
}
