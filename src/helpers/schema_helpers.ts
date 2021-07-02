/**
 * This file contains pure functions which help parse orma schemas
 * @module
 */

import { orma_schema } from '../introspector/introspector'


export interface edge {
    from_entity: string
    from_field: string
    to_entity: string
    to_field: string
}

/**
 * @returns a list of entities specified in the schema
 */
export const get_entity_names = (orma_schema: orma_schema) => {
    return Object.keys(orma_schema.entities ?? [])
}


/**
 * @returns a list of fields attatched to the given entity
 */
export const get_field_names = (entity_name: string, orma_schema: orma_schema) => {
    return Object.keys(orma_schema.entities?.[entity_name]?.fields ?? {})
}


// /**
//  * @returns given an entity, returns true if the entity is in the schema
//  */
// export const is_entity_name = (entity_name, orma_schema) => !!orma_schema.entities?.[entity_name]

// export const is_field_name = (entity_name, field_name, orma_schema) => !!orma_schema.entities?.[entity_name]?.fields?.[field_name]

/**
 * Gets a list of edges from given entity -> parent entity
 */
export const get_parent_edges = (entity_name: string, orma_schema: orma_schema): edge[] => {
    const fields_schema = orma_schema.entities?.[entity_name]?.fields ?? {}

    const parent_edges = Object.keys(fields_schema).flatMap(field_name => {
        if (fields_schema[field_name]) {
            const parent_entity_name = Object.keys(fields_schema[field_name].references ?? {})[0]
            if (!parent_entity_name) {
                return []
            }
            const parent_field_name = Object.keys(fields_schema[field_name].references[parent_entity_name])[0]

            return [{
                from_entity: entity_name,
                from_field: field_name,
                to_entity: parent_entity_name,
                to_field: parent_field_name
            }]
        } else {
            return []
        }
    })

    return parent_edges
}

/**
 * Swaps the 'from' and 'to' components of an edge
 */
export const reverse_edge = (edge: edge): edge => ({
    from_entity: edge.to_entity,
    from_field: edge.to_field,
    to_entity: edge.from_entity,
    to_field: edge.from_field
})


// we use a map because it can take objects as keys (they are compared by reference)
const child_edges_cache_by_schema = new Map<
    orma_schema,
    Record<string, edge[]> 
>()

// a helper method, having all the child edges in a single cache object helps it be memoized
const get_child_edges_cache = (orma_schema) => {
    if (child_edges_cache_by_schema.has(orma_schema)) {
        return child_edges_cache_by_schema.get(orma_schema)
    }

    const entity_names = get_entity_names(orma_schema)
    const cache: Record<string, edge[]> = {}
    for (const entity_name of entity_names) {
        const parent_edges = get_parent_edges(entity_name, orma_schema)
        const child_edges = parent_edges.map(reverse_edge)
        for (const child_edge of child_edges) {
            if (!cache[child_edge.from_entity]) {
                cache[child_edge.from_entity] = []
            }

            cache[child_edge.from_entity].push(child_edge)
        }
    }

    // now cache has keys of each entity name, with the value being an array of the child edges, with no duplicates
    child_edges_cache_by_schema.set(orma_schema, cache)
    return cache
}

/**
 * Gets a list of edges from given entity -> child entity
 */
export const get_child_edges = (entity_name: string, orma_schema: orma_schema) => {
    const child_edges_cache = get_child_edges_cache(orma_schema)

    return child_edges_cache[entity_name]
}

/**
 * Gets a list of edges from given entity -> parent or child entity
 */
export const get_all_edges = (entity_name, orma_schema) => {
    const parent_edges = get_parent_edges(entity_name, orma_schema)
    const child_edges = get_child_edges(entity_name, orma_schema)
    return [...parent_edges, ...child_edges]
}