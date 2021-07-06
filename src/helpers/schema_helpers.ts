/**
 * This file contains pure functions which help parse orma schemas
 * @module
 */

import { orma_field_schema, orma_schema } from '../introspector/introspector'


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
    return Object.keys(orma_schema)
}


/**
 * @returns a list of fields attatched to the given entity
 */
export const get_field_names = (entity_name: string, orma_schema: orma_schema) => {
    return Object.keys(orma_schema[entity_name] ?? {})
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
    const fields_schema = orma_schema[entity_name] ?? {}

    const parent_edges = Object.keys(fields_schema).flatMap(field_name => {
        if (is_reserved_keyword(field_name)) {
            return [] // could be $comment, which is not actually a field
        }

        const field_schema = (fields_schema[field_name] ?? {}) as orma_field_schema
        const parent_entity_name = Object.keys(field_schema.references ?? {})[0]
        if (!parent_entity_name) {
            return []
        }
        const parent_field_name = Object.keys(field_schema.references[parent_entity_name])[0]

        return [{
            from_entity: entity_name,
            from_field: field_name,
            to_entity: parent_entity_name,
            to_field: parent_field_name
        }]
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

    return child_edges_cache[entity_name] ?? []
}

/**
 * Gets a list of edges from given entity -> parent or child entity
 */
export const get_all_edges = (entity_name, orma_schema) => {
    const parent_edges = get_parent_edges(entity_name, orma_schema)
    const child_edges = get_child_edges(entity_name, orma_schema)
    return [...parent_edges, ...child_edges]
}

/**
 * Returns true if the input is a reserved keyword, which means it starts with $ like $select or $or
 */
export const is_reserved_keyword = (keyword: any) =>
    typeof keyword === 'string'
    && keyword[0] === '$'

/* gets possible parent or child edges between two tables that are immediate child/parent or parent/child
 */
export const get_direct_edges = (from_entity: string, to_entity: string, orma_schema: orma_schema) => {
    const possible_edges = get_all_edges(from_entity, orma_schema)
    const edges = possible_edges.filter(el => el.to_entity === to_entity)
    return edges
}

/* just like get edges, but only returns one conenction between two directly connected tables.
 * This will throw an error if there is not exactly one edge
 */
export const get_direct_edge = (from_entity: string, to_entity: string, orma_schema: orma_schema) => {
    const edges = get_direct_edges(from_entity, to_entity, orma_schema)

    if (edges.length !== 1) {
        throw Error(`Did not find exactly one edge from ${from_entity} to ${to_entity}`)
    }

    return edges[0]
}


/**
 * returns a list of edges which, when traversed one after the other, connect the first given entity to the last.
 * The total length of the edge_path will be `entities.length - 1`.
 * This function will throw an error if there is more than one edge between any two tables in the entity list
 * @param entities a list of directly connected entities
 */
export const get_edge_path = (entities: string[], orma_schema: orma_schema): edge[] => {
    if (entities.length <= 1) {
        return []
    }

    const edge_path = entities.flatMap((entity, i) => {
        if (i === 0) {
            // if (tables.length === 1) {
            //     return { root: table, to_table: table }
            // } else {
            //     return []
            // }
            return []
        }

        const from_entity = entities[i - 1]
        const to_entity = entities[i]

        const edge = get_direct_edge(from_entity, to_entity, orma_schema)

        return edge
    })

    return edge_path
}