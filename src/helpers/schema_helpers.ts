/**
 * This file contains pure functions which help parse orma schemas
 * @module
 */

import { orma_field_schema, OrmaSchema } from '../introspector/introspector'

export type Edge = {
    from_entity: string
    from_field: string
    to_entity: string
    to_field: string
}

/**
 * @returns a list of entities specified in the schema
 */
export const get_entity_names = (orma_schema: OrmaSchema) => {
    return Object.keys(orma_schema).filter(el => !is_reserved_keyword(el))
}

/**
 * @returns a list of fields attatched to the given entity
 */
export const get_field_names = (
    entity_name: string,
    orma_schema: OrmaSchema
) => {
    return Object.keys(orma_schema[entity_name] ?? {}).filter(
        el => !is_reserved_keyword(el)
    )
}

/**
 * @returns given an entity, returns true if the entity is in the schema
 */
export const is_entity_name = (entity_name, orma_schema) =>
    !!orma_schema?.[entity_name]

export const is_field_name = (entity_name, field_name, orma_schema) =>
    !!orma_schema?.[entity_name]?.[field_name]

/**
 * Gets a list of edges from given entity -> parent entity
 */
export const get_parent_edges = (
    entity_name: string,
    orma_schema: OrmaSchema
): Edge[] => {
    const fields_schema = orma_schema[entity_name] ?? {}

    const parent_edges = Object.keys(fields_schema).flatMap(field_name => {
        if (is_reserved_keyword(field_name)) {
            return [] // could be $comment, which is not actually a field
        }

        const field_schema = (fields_schema[field_name] ??
            {}) as orma_field_schema
        const parent_entity_name = Object.keys(field_schema.references ?? {})[0]
        if (!parent_entity_name) {
            return []
        }
        const parent_field_name = Object.keys(
            field_schema.references[parent_entity_name]
        )[0]

        return [
            {
                from_entity: entity_name,
                from_field: field_name,
                to_entity: parent_entity_name,
                to_field: parent_field_name,
            },
        ]
    })

    return parent_edges
}

/**
 * Swaps the 'from' and 'to' components of an edge
 */
export const reverse_edge = (edge: Edge): Edge => ({
    from_entity: edge.to_entity,
    from_field: edge.to_field,
    to_entity: edge.from_entity,
    to_field: edge.from_field,
})

// we use a map because it can take objects as keys (they are compared by reference)
const child_edges_cache_by_schema = new Map<
    OrmaSchema,
    Record<string, Edge[]>
>()

// a helper method, having all the child edges in a single cache object helps it be memoized
const get_child_edges_cache = orma_schema => {
    if (child_edges_cache_by_schema.has(orma_schema)) {
        return child_edges_cache_by_schema.get(orma_schema)
    }

    const entity_names = get_entity_names(orma_schema)
    const cache: Record<string, Edge[]> = {}
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
export const get_child_edges = (
    entity_name: string,
    orma_schema: OrmaSchema
) => {
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
export const is_reserved_keyword = (keyword: any) => keyword?.[0] === '$'

/**
 * Gets possible parent or child edges between two tables that are immediate child/parent or parent/child
 */
export const get_direct_edges = (
    from_entity: string,
    to_entity: string,
    orma_schema: OrmaSchema
) => {
    const possible_edges = get_all_edges(from_entity, orma_schema)
    const edges = possible_edges.filter(el => el.to_entity === to_entity)
    return edges
}

/* just like get edges, but only returns one conenction between two directly connected tables.
 * This will throw an error if there is not exactly one edge
 */
export const get_direct_edge = (
    from_entity: string,
    to_entity: string,
    orma_schema: OrmaSchema,
    foreign_key_override: string[] = undefined
) => {
    const parent_edges = get_parent_edges(from_entity, orma_schema).filter(
        el => el.to_entity === to_entity
    )
    const child_edges = get_child_edges(from_entity, orma_schema).filter(
        el => el.to_entity === to_entity
    )

    const filtered_parent_edges = foreign_key_override
        ? parent_edges.filter(
              edge => edge.from_field === foreign_key_override[0]
          )
        : parent_edges

    const filtered_child_edges = foreign_key_override
        ? child_edges.filter(edge => edge.to_field === foreign_key_override[0])
        : child_edges

    const edges = [...filtered_parent_edges, ...filtered_child_edges]

    if (edges.length !== 1) {
        throw Error(
            `Did not find exactly one edge from ${from_entity} to ${to_entity}`
        )
    }

    return edges[0]
}

/**
 * returns a list of edges which, when traversed one after the other, connect the first given entity to the last.
 * The total length of the edge_path will be `entities.length - 1`.
 * This function will throw an error if there is more than one edge between any two tables in the entity list
 * @param entities a list of directly connected entities
 */
export const get_edge_path = (
    entities: string[],
    orma_schema: OrmaSchema
): Edge[] => {
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

/**
 * Returns true if entity1 is a parent of entity2
 */
export const is_parent_entity = (
    entity1: string,
    entity2: string,
    orma_schema: OrmaSchema
) => {
    const edges = get_child_edges(entity1, orma_schema)
    return edges.some(edge => edge.to_entity === entity2)
}

/**
 * Gets a list of field names which have been marked as primary keys. More than one result indicates a compound primary key
 */
export const get_primary_keys = (
    entity_name: string,
    orma_schema: OrmaSchema
) => {
    const fields = get_field_names(entity_name, orma_schema)
    const primary_key_fields = fields.filter(field => {
        const field_schema = orma_schema[entity_name][
            field
        ] as orma_field_schema
        if (typeof field_schema === 'string') {
            return false
        }

        return field_schema.primary_key
    })

    return primary_key_fields
}

/**
 * Gets a list of field names which have been marked as unique, grouped into arrays to include indexes with
 * multiple fields. Optionally excludes nullable unique fields.
 *
 * @example
 * return [
 *   ['unique_field'],
 *   ['primary_key_field'],
 *   ['compound_unique_field1', 'compound_unique_field2']
 * ]
 */
export const get_unique_field_groups = (
    entity_name: string,
    exclude_nullable: boolean,
    orma_schema: OrmaSchema
): string[][] => {
    const indexes = orma_schema[entity_name]?.$indexes ?? []
    const unique_field_groups = indexes
        .filter(index => index.is_unique)
        .filter(index => {
            if (exclude_nullable) {
                const all_fields_non_nullable = index.fields.every(field => {
                    const field_schema = orma_schema[entity_name][
                        field
                    ] as orma_field_schema
                    return field_schema.not_null
                })

                return all_fields_non_nullable
            } else {
                return true
            }
        })
        .map(index => index.fields)

    return unique_field_groups as string[][]
}

export const field_exists = (
    entity: string,
    field: string | number,
    schema: OrmaSchema
) => {
    return schema[entity]?.[field]
}

/**
 * Returns true if a field is required to be initially provided by the user. Any field with a default is not required,
 * which includes nullable fields which default to null.
 */
export const is_required_field = (
    entity: string,
    field: string,
    schema: OrmaSchema
) => {
    const field_schema = schema?.[entity]?.[field] as orma_field_schema
    const is_required =
        field_schema.not_null &&
        !field_schema.default &&
        !field_schema.auto_increment
    return is_required
}

export const get_parent_edges_for_field = (
    entity: string,
    field: string,
    orma_schema: OrmaSchema
) => {
    const parent_edges = get_parent_edges(entity, orma_schema)
    const matching_edges = parent_edges.filter(el => el.from_field === field)
    return matching_edges
}
