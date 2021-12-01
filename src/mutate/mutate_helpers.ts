import { deep_for_each, last } from '../helpers/helpers'
import { Path, PathedRecord } from '../types'

export const split_mutation_by_entity = mutation => {
    const paths_by_entity: Record<string, PathedRecord[]> = {}
    mutation_entity_deep_for_each(mutation, (record, path, entity_name) => {
        if (!paths_by_entity[entity_name]) {
            paths_by_entity[entity_name] = []
        }

        paths_by_entity[entity_name].push({ record, path })
    })

    return paths_by_entity
}

/**
 * Like {@link deep_for_each} but only calls the processor function when value is a record in the given mutation
 */
export const mutation_entity_deep_for_each = (
    mutation,
    processor: (
        value: any,
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
