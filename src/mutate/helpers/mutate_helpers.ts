import { deep_for_each, last } from '../../helpers/helpers'
import { is_reserved_keyword } from '../../helpers/schema_helpers'
import { Path } from '../../types'

/**
 * Like {@link deep_for_each} but only calls the processor function when value is a record in the given mutation
 */
export const mutation_entity_deep_for_each = (
    mutation,
    processor: (
        value: Record<string, any>,
        path: (string | number)[],
        entity_name: string
    ) => void
) => {
    deep_for_each(mutation, (value, path) => {
        if (
            path.length > 1 &&
            typeof last(path) === 'number' &&
            typeof path[path.length - 2] === 'string'
        ) {
            // we are on an entity object
            const entity_name = path[path.length - 2] as string

            processor(value, path, entity_name)
        }
    })
}

export const get_higher_path = (path: Path) => {
    const higher_path =
        typeof last(path) === 'number'
            ? path.slice(0, path.length - 2)
            : path.slice(0, path.length - 1)

    return higher_path
}

export const path_to_entity = (path: (number | string)[]) => {
    return typeof last(path) === 'number'
        ? (path[path.length - 2] as string)
        : (last(path) as string)
}

export const for_each_guid = (
    record: Record<string, any>,
    callback: (key, value, guid) => any
) => {
    Object.entries(record).forEach(([key, value]) => {
        const guid = value?.$guid
        if (guid !== undefined) {
            callback(key, value, guid)
        }
    })
}

export const is_submutation = (record: Record<string, any>, field: string) =>
    Array.isArray(record[field]) && !is_reserved_keyword(field)
