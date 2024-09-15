import { OrmaError } from '../../helpers/error_handling'
import { Path } from '../../types'
import { format_value } from './message_formatting'

export const make_validation_error = (
    value: any,
    parent_path: Path,
    prop: string | number | undefined,
    message: string
) => {
    const path = [...parent_path, ...(prop ? [prop] : [])]
    const last_path_el = path.length ? path[path.length - 1] : undefined
    const prop_name =
        typeof last_path_el === 'string' ? last_path_el : undefined

    return {
        error_code: 'validation_error',
        message: get_validation_error_message(prop_name, value, message),
        path: path
    } as OrmaError
}

export const get_validation_error_message = (
    prop_name: string | undefined | null,
    value: any,
    message: string
) => `${prop_name ? `${prop_name}: ` : ''}${format_value(value)} ${message}`

export const validate_string = (
    value: any,
    parent_path: Path,
    prop: string | number | undefined,
    allow_undefined: boolean = false
): OrmaError[] => {
    if (value === undefined && allow_undefined) return []

    if (typeof value !== 'string') {
        return [
            make_validation_error(value, parent_path, prop, `must be a string.`)
        ]
    }

    return []
}

export const validate_boolean = (
    value: any,
    parent_path: Path,
    prop: string | number | undefined,
    allow_undefined: boolean = false
): OrmaError[] => {
    if (value === undefined && allow_undefined) return []

    if (typeof value !== 'boolean') {
        return [
            make_validation_error(
                value,
                parent_path,
                prop,
                `must be true or false.`
            )
        ]
    }

    return []
}

export const validate_number = (
    value: any,
    parent_path: Path,
    prop: string | number | undefined,
    allow_undefined: boolean = false
): OrmaError[] => {
    if (value === undefined && allow_undefined) return []

    if (typeof value !== 'number') {
        return [
            make_validation_error(value, parent_path, prop, `must be a number.`)
        ]
    }

    return []
}

export const validate_not_empty = (
    value: any,
    parent_path: Path,
    prop: string | number | undefined
): OrmaError[] => {
    if (!value) {
        return [
            make_validation_error(value, parent_path, prop, `cannot be empty.`)
        ]
    }

    return []
}

export const validate_array = (
    value: any,
    parent_path: Path,
    prop: string | number | undefined,
    allow_undefined: boolean = false
): OrmaError[] => {
    if (value === undefined && allow_undefined) return []

    if (!Array.isArray(value)) {
        return [
            make_validation_error(value, parent_path, prop, `must be an array.`)
        ]
    }

    return []
}

export const validate_array_not_empty = (
    value: any,
    parent_path: Path,
    prop: string | number | undefined
): OrmaError[] => {
    if (!value?.length) {
        return [
            make_validation_error(value, parent_path, prop, `cannot be empty.`)
        ]
    }

    return []
}

export const validate_positive_integer = (
    value: any,
    parent_path: Path,
    prop: string | number | undefined,
    allow_undefined: boolean = false
): OrmaError[] => {
    if (value === undefined && allow_undefined) return []

    if (typeof value !== 'number' || value < 0 || !Number.isInteger(value)) {
        return [
            make_validation_error(
                value,
                parent_path,
                prop,
                `must be a positive integer.`
            )
        ]
    }

    return []
}

export const optional_sql_to_string = (sql: string, show_sql: boolean) =>
    show_sql ? ` ${sql}` : ''

// export const validate_enum = (
//     value: any,
//     parent_path: Path,
//     prop: string | number | undefined,
//     valid_values: Set<any>
// ): OrmaError[] => {
//     if (!valid_values.has(value)) {
//         return [
//             make_validation_error(value, parent_path, prop, `must be one of`)
//         ]
//     }

//     return []
// }
