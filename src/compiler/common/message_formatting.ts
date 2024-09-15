import { is_simple_object } from '../../helpers/helpers'

export const format_list_of_values = (
    values: Parameters<typeof format_value>[0][]
) => {
    const formatted_string = values.map(format_value).join(', ')
    return formatted_string
}

export const format_value = (
    value: string | number | boolean | null | undefined | any[],
    revealed_item_count: number = 4
) => {
    if (typeof value === 'string') {
        return `'${value}'`
    } else if (Array.isArray(value)) {
        return `[ ${summarize_array_contents(value, revealed_item_count)} ]`
    } else if (is_simple_object(value)) {
        const properties_count = Object.keys(value).length
        return `{ ...${properties_count} ${
            properties_count === 1 ? 'property' : 'properties'
        }}`
    } else {
        return `${value}`
    }
}

export const summarize_array_contents = (
    value: any[],
    revealed_item_count: number
) => {
    const revealed_items = value.slice(0, revealed_item_count)
    const remaining_items_count = Math.max(
        0,
        value.length - revealed_item_count
    )

    const revealed_items_string = revealed_items.map(el =>
        format_value(el, revealed_item_count)
    )

    const remaining_items_string = remaining_items_count
        ? `, ...${remaining_items_count} item${
              remaining_items_count === 1 ? '' : 's'
          }`
        : ''

    return `${revealed_items_string}${remaining_items_string}`
}

/**
 * e.g. array_to_readable_list([1,"hi", 3], 'and') === "1, 'hi' and 3'
 */
export const array_to_readable_list = (
    items: any[],
    last_item_separator: string
) => {
    const initial_items_string = items
        .slice(0, -1)
        .map(el => format_value(el))
        .join(', ')

    const last_item =
        items.length > 0 ? format_value(items[items.length - 1]) : ''
    const final_string = [initial_items_string, last_item]
        .filter(el => !!el)
        .join(` ${last_item_separator} `)
    return final_string
}
