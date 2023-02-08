/**
 * This file contains pure functions which help parse orma schemas
 * @module
 */

import { OrmaSchema } from '../types/schema/schema_types'

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
    return Object.keys(orma_schema.$entities).filter(
        el => !is_reserved_keyword(el)
    )
}

/**
 * @returns a list of fields attatched to the given entity
 */
export const get_field_names = (
    entity_name: string,
    orma_schema: OrmaSchema
) => {
    return Object.keys(orma_schema.$entities?.[entity_name]?.$fields ?? {})
}

/**
 * @returns given an entity, returns true if the entity is in the schema
 */
export const is_entity_name = (entity_name, orma_schema: OrmaSchema) =>
    !!orma_schema?.$entities?.[entity_name]

export const is_field_name = (
    entity_name,
    field_name,
    orma_schema: OrmaSchema
) => !!orma_schema?.$entities?.[entity_name]?.$fields?.[field_name]

/**
 * Gets a list of edges from given entity -> parent entity
 */
export const get_parent_edges = (
    entity_name: string,
    orma_schema: OrmaSchema
): Edge[] => {
    const entity_schema =
        orma_schema.$entities[entity_name] ??
        ({} as OrmaSchema['$entities'][string])
    const foreign_keys = entity_schema.$foreign_keys ?? []
    const edges = foreign_keys.map(foreign_key => ({
        from_entity: entity_name,
        from_field: foreign_key?.$fields?.[0],
        to_entity: foreign_key?.$references?.$entity,
        to_field: foreign_key?.$references?.$fields?.[0],
    }))
    return edges
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

/**
 * Gets a list of edges from given entity -> child entity
 */
export const get_child_edges = (
    entity_name: string,
    orma_schema: OrmaSchema
) => {
    const foreign_keys =
        orma_schema.$cache?.$reversed_foreign_keys?.[entity_name] ?? []
    const edges = foreign_keys.map(foreign_key => ({
        from_entity: entity_name,
        ...foreign_key,
    }))
    return edges
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
    foreign_key_override: string[] | undefined = undefined
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
    const primary_key_fields =
        orma_schema.$entities[entity_name].$primary_key?.$fields

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
    const unique_keys = orma_schema.$entities[entity_name]?.$unique_keys ?? []
    const unique_field_groups = unique_keys
        .filter(unique_key => {
            if (exclude_nullable) {
                const all_fields_non_nullable = unique_key.$fields?.every(
                    field => {
                        const field_schema =
                            orma_schema.$entities[entity_name].$fields?.[field]
                        return field_schema?.$not_null
                    }
                )

                return all_fields_non_nullable
            } else {
                return true
            }
        })
        .map(unique_key => unique_key.$fields)

    return unique_field_groups as string[][]
}

export const field_exists = (
    entity: string,
    field: string | number,
    schema: OrmaSchema
) => {
    return !!schema.$entities[entity]?.$fields?.[field]
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
    const field_schema = schema?.$entities?.[entity]?.$fields?.[field]
    const is_required =
        !!field_schema.$not_null &&
        !field_schema.$default &&
        !field_schema.$auto_increment
    return is_required
}

export const get_field_is_nullable = (
    schema: OrmaSchema,
    entity: string,
    field: string
) => {
    const field_schema = schema?.$entities?.[entity]?.$fields?.[field]
    const is_nullable = !field_schema?.$not_null
    return is_nullable
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

export const get_field_schema = (
    schema: OrmaSchema,
    entity: string,
    field: string
) => {
    const field_schema = schema?.$entities?.[entity]?.$fields?.[field]
    return field_schema
}

export const can_have_guid = (
    schema: OrmaSchema,
    entity: string,
    field: string
) => {
    const is_primary_key =
        schema?.$entities?.[entity]?.$primary_key?.$fields?.includes(field)
    const foreign_keys = schema?.$entities?.[entity]?.$foreign_keys ?? []
    const is_foreign_key = foreign_keys.some(el => el.$fields?.includes(field))

    return is_primary_key || is_foreign_key
}
