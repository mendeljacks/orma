import { deep_for_each, deep_get, last } from '../../helpers/helpers'
import { Path, PathedRecord } from '../../types'
import { MutationPiece } from '../plan/mutation_plan'

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

export const get_lower_mutation_pieces = (mutation_piece: MutationPiece) => {
    const { record, path } = mutation_piece
    const lower_pieces = Object.keys(record).flatMap(field => {
        if (Array.isArray(record[field])) {
            return record[field].map((lower_record, i) => ({
                record: lower_record,
                path: [...path, field, i],
            }))
        } else {
            return []
        }
    })

    return lower_pieces
}

export const get_higher_path = (path: Path) => {
    const higher_path =
        typeof last(path) === 'number'
            ? path.slice(0, path.length - 2)
            : path.slice(0, path.length - 1)

    return higher_path
}

export const get_connected_mutation_pieces = (
    mutation: any,
    mutation_piece: MutationPiece
) => {
    const higher_path = get_higher_path(mutation_piece.path)
    const higher_record = deep_get(higher_path, mutation, undefined)
    const higher_mutation_piece = { record: higher_record, path: higher_path }
    const lower_mutation_pieces = get_lower_mutation_pieces(mutation_piece)
    return [higher_mutation_piece, ...lower_mutation_pieces]
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
