import { deep_equal, has_prop } from '../../helpers/helpers'
import { lir_join } from '../../helpers/lir_join'

const is_array = el => Array.isArray(el)
const is_object = el =>
    !Array.isArray(el) && typeof el === 'object' && el !== null
const is_primitive = el => !is_array(el) && !is_object(el)

export const diff_mutation = (original, modified) => {
    if (is_primitive(modified) || modified?.$guid !== undefined) {
        return modified
    }
    if (!is_object(original) && is_object(modified)) {
        const uo = {
            id: modified.id,
            ...diff_mutation({}, modified),
            $operation: 'create',
        }
        if (!uo.id) delete uo.id
        return uo
    }
    if (!is_array(original) && is_array(modified)) {
        return diff_mutation([], modified)
    }
    if (is_array(original) && is_array(modified)) {
        ;[...original, ...modified].forEach(el => {
            if (!is_object(el))
                throw new Error('Array elements can only contain objects')
        })

        const { left, inner, right } = lir_join(
            original,
            [],
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
                    const update_obj = diff_mutation(left_obj, right_obj)
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
                $operation: 'delete',
                id: obj.id,
            })),
            ...inner, // Recursively made in the inner function
            ...right.map(obj => ({
                $operation: 'create',
                ...obj,
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
                update_obj[key] = diff_mutation(original_value, modified_value)
            }
        }
        for (let i = 0; i < original_columns.length; i++) {
            const key = original_columns[i]
            if (!has_prop(key, modified)) {
                update_obj[key] = undefined
            }
        }

        return update_obj
    }

    throw new Error('All types must be primitives objects or arrays')
}
