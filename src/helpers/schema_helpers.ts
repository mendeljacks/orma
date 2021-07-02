/**
 * This file contains pure functions which help parse orma schemas
 * @module
 */

import { orma_schema } from '../introspector/introspector'


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

export const get_parent_edges = (entity_name, orma_schema) => {
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

export const get_child_edges = (entity_name, orma_schema) => {
    const child_edges = []
    
    for (const check_entity_name of get_entity_names(orma_schema)) {
        const check_entity_schema = orma_schema.entities[check_entity_name]
        const field_names = Object.keys(check_entity_schema.fields)
        for (const check_field_name of field_names) {
            const check_field_schema = check_entity_schema.fields[check_field_name]
            if (check_field_schema.references?.[entity_name]) {
                const referenced_field_name = Object.keys(check_field_schema.references[entity_name])[0]
                child_edges.push({
                    from_entity: entity_name,
                    from_field: referenced_field_name,
                    to_entity: check_entity_name,
                    to_field: check_field_name
                })
            }
        }
    }

    return child_edges
}

export const get_edges = (entity_name, orma_schema) => {
    const parent_edges = get_parent_edges(entity_name, orma_schema)
    const child_edges = get_child_edges(entity_name, orma_schema)
    return [...parent_edges, ...child_edges]
}