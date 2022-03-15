import { deep_for_each, is_simple_object } from '../../helpers/helpers'
import { orma_schema } from '../../introspector/introspector'

export const apply_inherit_operations_macro = (
    mutation
) => {
    inherit_operations_macro_recursive(mutation)
}

const inherit_operations_macro_recursive = (item, inherited_operation=undefined) => {
    const is_object = is_simple_object(item)
    const is_array = Array.isArray(item)

    let operation = inherited_operation
    // $operation props can only exist on objects
    if (is_object) {
        // if there is no operation, set it based on the ancestor operation
        // otherwise, change the inherited operation to the existing operation
        if (item.$operation === undefined && inherited_operation !== undefined) {
            item.$operation = inherited_operation
        } else {
            operation = item.$operation
        }
    }

    if (is_object) {
        for (const prop in item) {
            inherit_operations_macro_recursive(item[prop], operation)
        }
    }

    if (is_array) {
        item.forEach((el, i) => {
            inherit_operations_macro_recursive(el, operation)
        })
    }

    // we dont need to process primitives, ignore them
}