// export const validate = () =>

import { OrmaError } from '../../helpers/error_handling'
import { is_simple_object } from '../../helpers/helpers'
import { Path } from '../../types'
import { array_to_readable_list, format_value } from './message_formatting'

export const validate = (
    schema: ValidationSchema,
    path: Path,
    value: any
): OrmaError[] => {
    const errors = validate_inner(schema, path, value)
    return errors.map(error => {
        const prop_string = get_error_prop_string(error.path)
            ? `"${get_error_prop_string(error.path)}" `
            : ''
        return {
            error_code: 'validation_error',
            message: `${prop_string}${error.message}`,
            path,
            additional_info: {
                schema
            }
        }
    })
}

const get_error_prop_string = (path: Path) => {
    const last_el = typeof path[path.length - 1]
    if (typeof last_el === 'string') {
        return last_el
    }

    const last_string_index = path.findIndex(el => typeof el === 'string')
    if (last_string_index === -1) {
        return undefined
    }

    const string_indices_string = path
        .slice(last_string_index + 1, Infinity)
        .map(el => `[${el}]`)
        .join('')
    return `${path[last_string_index]}${string_indices_string}`
}

export const validate_inner = (
    schema: ValidationSchema,
    path: Path,
    value: any
): { message: string; path: Path }[] => {
    if ('anyOf' in schema) {
        const child_schema_errors = schema.anyOf.map(child_schema =>
            validate_inner(child_schema, path, value)
        )
        const matches_any = child_schema_errors.some(el => el.length > 0)
        return !matches_any
            ? [{ message: `must be ${get_schema_description(schema)}`, path }]
            : []
    }

    if ('not' in schema) {
        const child_matches = check_simple_schema(schema.not, value)
        return child_matches
            ? [{ message: `must be ${get_schema_description(schema)}`, path }]
            : []
    }

    if ('type' in schema) {
        const matches = check_simple_schema(schema, value)
        if (!matches) {
            return [
                { message: `must be ${get_schema_description(schema)}`, path }
            ]
        }

        if (schema.type === 'object') {
            const required_errors = (schema.required ?? [])
                .filter(required_prop => value[required_prop] === undefined)
                .map(required_prop => ({
                    message: `must have property "${required_prop}"`,
                    path
                }))

            const property_errors = Object.keys(
                schema.properties ?? {}
            ).flatMap(prop =>
                validate_inner(
                    schema.properties![prop],
                    [...path, prop],
                    value[prop]
                )
            )

            return [...required_errors, ...property_errors]
        }

        if (schema.type === 'array') {
            const min_count_errors =
                schema.minItems !== undefined && value.length < schema.minItems
                    ? [
                          {
                              message:
                                  schema.minItems === 1
                                      ? 'must be non-empty'
                                      : `must have more than ${schema.minItems} items.`
                          },
                          path
                      ]
                    : []
            const max_count_errors =
                schema.maxItems !== undefined && value.length < schema.maxItems
                    ? [
                          {
                              message: `must have less than ${schema.maxItems} items.`
                          },
                          path
                      ]
                    : []

            const prefix_item_errors = schema.prefixItems
                ? schema.prefixItems.flatMap((child_schema, i) =>
                      validate_inner(child_schema, [...path, i], value[i])
                  )
                : []

            const schema_items = schema.items
            const item_errors = schema_items
                ? value.flatMap((item, i) => {
                      const prefix_length = schema.prefixItems?.length ?? 0
                      if (i < prefix_length) {
                          return []
                      }

                      return validate_inner(schema_items, [...path, i], item)
                  })
                : []

            return [
                ...min_count_errors,
                ...max_count_errors,
                ...prefix_item_errors,
                ...item_errors
            ]
        }
    }

    return []
}

const check_simple_schema = (schema: ValidationSchema, value: any): boolean => {
    if (Object.keys(schema).length === 0) {
        return true
    }

    if ('enum' in schema) {
        return schema.enum.has(value)
    } else if ('type' in schema) {
        if (schema.type === 'null') {
            return value === null
        } else if (schema.type === 'boolean') {
            return value === true || value === false
        } else if (schema.type === 'integer' || schema.type === 'number') {
            const passes_number = typeof value === 'number'
            const passes_integer =
                schema.type === 'number' || Number.isInteger(value)
            const passes_min =
                schema.minimum === undefined || value >= schema.minimum
            const passes_max =
                schema.maximum === undefined || value <= schema.maximum
            return passes_number && passes_integer && passes_min && passes_max
        } else if (schema.type === 'string') {
            const passes_string = typeof value === 'string'
            const passes_min =
                schema.minLength === undefined ||
                value.length >= schema.minLength
            const passes_max =
                schema.maxLength === undefined ||
                value.length <= schema.maxLength
            return passes_string && passes_min && passes_max
        } else if (schema.type === 'array') {
            return Array.isArray(value)
        } else if (schema.type === 'object') {
            return is_simple_object(value)
        }
    }

    throw new Error('Unrecognised validation schema format.')
}

const get_schema_description = (schema: ValidationSchema): string => {
    if (Object.keys(schema).length === 0) {
        return 'anything'
    }

    if ('anyOf' in schema) {
        const schema_strings = schema.anyOf.map(child_schema =>
            get_schema_description(child_schema)
        )
        return `${array_to_readable_list(schema_strings, 'or')}`
    } else if ('not' in schema) {
        return `not ${get_schema_description(schema)}`
    } else if ('enum' in schema) {
        return `one of ${format_value(Array.from(schema.enum))}`
    } else if ('type' in schema) {
        if (schema.type === 'object') {
            return 'an object'
        } else if (schema.type === 'array') {
            return 'an array'
        } else if (schema.type === 'null') {
            return 'null'
        } else if (schema.type === 'boolean') {
            return 'a boolean'
        } else if (schema.type === 'integer' || schema.type === 'number') {
            const postitive_string = schema.minimum === 0 ? ' postive' : ''
            const negative_string = schema.maximum === 0 ? ' negative' : ''
            const min_string =
                schema.minimum !== undefined && schema.minimum !== 0
                    ? ` more than ${schema.minimum}`
                    : ''
            const max_string =
                schema.maximum !== undefined && schema.maximum !== 0
                    ? ` less than ${schema.maximum}`
                    : ''

            const min_max_string = [min_string, max_string]
                .filter(el => !!el)
                .join(' and')

            const determiner_string =
                schema.type === 'integer' &&
                !postitive_string &&
                !negative_string
                    ? 'an'
                    : 'a'

            return `${determiner_string}${postitive_string}${negative_string} ${schema.type}${min_max_string}`
        } else if (schema.type === 'string') {
            const non_empty_string = schema.minLength === 1 ? ' non-empty' : ''
            const min_string =
                schema.minLength !== undefined && schema.minLength !== 1
                    ? ` more than ${schema.minLength} characters`
                    : ''
            const max_string =
                schema.maxLength !== undefined
                    ? ` less than ${schema.maxLength} characters`
                    : ''

            const min_max_string = [min_string, max_string]
                .filter(el => !!el)
                .join(' and')

            const with_string = min_max_string ? ` with${min_max_string}` : ''
            return `a${non_empty_string} string${with_string}${min_max_string}`
        }
    }

    throw new Error('Unrecognised validation schema format.')
}

export type ValidationSchema =
    | { enum: Set<any> }
    | { type: 'null' | 'boolean' }
    | {
          type: 'number'
          maximum?: number
          minimum?: number
      }
    | {
          type: 'integer'
          maximum?: number
          minimum?: number
      }
    | { type: 'string'; maxLength?: number; minLength?: number }
    | {
          type: 'object'
          required?: string[]
          properties?: Record<string, ValidationSchema>
      }
    | {
          type: 'array'
          minItems?: number
          maxItems?: number
          prefixItems?: ValidationSchema[]
          items?: ValidationSchema
      }
    // | { all_of: JsonSchema[] }
    | { anyOf: ValidationSchema[] }
    // | { one_of: JsonSchema[] }
    | { not: ValidationSchema }
    | {}
