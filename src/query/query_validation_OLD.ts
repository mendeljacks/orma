import { OrmaError } from '../helpers/error_handling'
import { deep_for_each, last } from '../helpers/helpers'
import {
    get_all_edges,
    get_entity_names,
    get_field_names,
    is_entity_name,
    is_field_name,
    is_parent_entity,
} from '../helpers/schema_helpers'
import { OrmaSchema } from '../introspector/introspector'
import { get_any_path_context_entity } from './macros/any_path_macro'

export const get_query_schema = (orma_schema: OrmaSchema) => {
    const entity_names = get_entity_names(orma_schema)

    const schema = {
        type: 'object',
        properties: entity_names.reduce(
            (acc, entity_name) => {
                acc[entity_name] = get_entity_schema(orma_schema, entity_name)
                return acc
            },
            {
                $where_connected: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            $entity: { type: 'string' },
                            $field: { type: 'string' },
                            $values: {
                                type: 'array',
                                items: {
                                    oneOf: [
                                        { type: 'string' },
                                        { type: 'number' },
                                    ],
                                },
                                minItems: 1,
                            },
                        },
                        additionalProperties: false,
                        required: ['$entity', '$field', '$values'],
                    },
                },
            }
        ),
        additionalProperties: {
            // discriminator speeds up validation (discriminator is an OpenAPI keyword, but not part of JSON Schema)
            type: 'object',
            discriminator: { propertyName: '$from' },
            oneOf: entity_names.map(entity_name => ({
                $ref: `#/properties/${entity_name}`,
            })),
        },
        $defs: {
            entity_name: {
                type: 'string',
                enum: entity_names,
            },
            $where: {
                any_path: get_any_path_schema(orma_schema, '$where'),
            },
            $having: {
                any_path: get_any_path_schema(orma_schema, '$having'),
            },
            entities: entity_names.reduce((acc, entity_name) => {
                acc[entity_name] = {
                    $where: {
                        operation: get_operation_schema(
                            orma_schema,
                            entity_name,
                            '$where'
                        ),
                        field: get_where_field_schema(
                            orma_schema,
                            entity_name,
                            '$where'
                        ),
                    },
                    $having: {
                        operation: get_operation_schema(
                            orma_schema,
                            entity_name,
                            '$having'
                        ),
                        field: get_where_field_schema(
                            orma_schema,
                            entity_name,
                            '$having'
                        ),
                    },
                }
                return acc
            }, {}),
        },
    }

    return schema
}

const get_entity_schema = (orma_schema: OrmaSchema, entity_name: string) => {
    const field_names = get_field_names(entity_name, orma_schema)
    const connected_entities = get_all_edges(entity_name, orma_schema).map(
        edge => edge.to_entity
    )

    // there are 5 cases for data properties:
    //   1. key is a field, value is a boolean. In this case the key will end up in the $select
    //   2. value is a field name. In this case the value will end up in the select
    //   3. value is an object with an SQL function (e.g. {$sum: 'field'})
    //   4. key is an entity name, value is a subquery (doesnt need a $from clause). The subquery is from the
    //      entity in key name
    //   4. value is a subquery with a $from clause (e.g. { id: true, $from: 'my_table'}). The subquery is from the
    //      entity in the $from clause

    const entity_schema = {
        type: 'object',
        properties: {
            ...field_names.reduce((acc, field_name) => {
                acc[field_name] = {
                    type: 'boolean',
                }
                return acc
            }, {}),
            // ...connected_entities.reduce((acc, connected_entity) => {
            //     acc[connected_entity] = {
            //         $ref: `#/properties/${connected_entity}`,
            //     }
            //     return acc
            // }, {}),
            $from: {
                type: 'string',
                const: entity_name,
            },
            $limit: {
                type: 'number',
                minimum: 0,
            },
            $offset: {
                type: 'number',
                minimum: 0,
            },
            $order_by: get_order_by_schema(orma_schema, entity_name),
            $group_by: {
                type: 'array',
                items: {
                    $ref: `#/$defs/entities/${entity_name}/$having/field`,
                },
            },
            $where: get_where_schema(orma_schema, entity_name, '$where'),
            $having: get_where_schema(orma_schema, entity_name, '$having'),
        },
        additionalProperties: {
            anyOf: [
                ...get_expression_schemas(orma_schema, entity_name),
                {
                    type: 'object',
                    properties: {
                        $as: {
                            type: 'array',
                        },
                    },
                    additionalProperties: false,
                },
                ...connected_entities.map(entity_name => ({
                    $ref: `#/properties/${entity_name}`,
                })),
            ],
        },
        required: ['$from'],
    }

    field_names.forEach(field_name => {
        entity_schema.properties[field_name] = {
            type: 'boolean',
        }
    })

    return entity_schema
}

const get_order_by_schema = (orma_schema: OrmaSchema, entity_name: string) => {
    const expression_schema = {
        $ref: `#/$defs/entities/${entity_name}/$having/field`,
    }

    const order_by_schema = {
        type: 'array',
        items: {
            anyOf: [
                expression_schema,
                {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        $asc: expression_schema,
                    },
                },
                {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        $desc: expression_schema,
                    },
                },
            ],
        },
    }

    return order_by_schema
}

// expressions resolve to fields, such as $sum or just a field name string
const get_expression_schemas = (
    orma_schema: OrmaSchema,
    entity_name: string
) => {
    const field_names = get_field_names(entity_name, orma_schema)

    return [
        {
            type: 'string',
            enum: field_names,
        },
        {
            type: 'object',
            properties: {
                $sum: {
                    type: 'string',
                    enum: field_names,
                },
            },
            additionalProperties: false,
        },
    ]
}

const get_where_schema = (
    orma_schema: OrmaSchema,
    entity_name: string,
    where_type: '$having' | '$where'
) => {
    const operation_schema = {
        $ref: `#/$defs/entities/${entity_name}/${where_type}/operation`,
    }

    const this_schema = {
        $ref: `#/properties/${entity_name}/properties/${where_type}`,
    }

    const where_clauses = [
        { $eq: operation_schema },
        { $gt: operation_schema },
        { $lt: operation_schema },
        { $gte: operation_schema },
        { $lte: operation_schema },
        { $like: operation_schema },
        {
            $and: {
                type: 'array',
                items: this_schema,
            },
        },
        {
            $or: {
                type: 'array',
                items: this_schema,
            },
        },
        {
            $in: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                // TODO: add a validation for a $select statement and add it to the $in keyword
                prefixItems: [
                    {
                        $ref: `#/$defs/entities/${entity_name}/${where_type}/field`,
                    },
                    {
                        type: 'array',
                        minItems: 1,
                        items: {
                            $ref: `#/$defs/entities/${entity_name}/${where_type}/operation/items`,
                        },
                    },
                ],
            },
        },
        { $not: this_schema },
    ]

    const where_schema = {
        oneOf: [
            ...where_clauses.map(properties => ({
                type: 'object',
                additionalProperties: false,
                properties,
            })),
            {
                $ref: `#/$defs/${where_type}/any_path`,
            },
        ],
    }

    return where_schema
}

const get_any_path_schema = (
    orma_schema: OrmaSchema,
    clause_type: '$where' | '$having'
) => {
    const entity_names = get_entity_names(orma_schema)

    const any_path_schema = {
        type: 'object',
        discriminator: { propertyName: '$any_path_last_entity' },
        required: ['$any_path_last_entity'],
        oneOf: entity_names.map(any_path_entity => ({
            type: 'object',
            additionalProperties: false,
            properties: {
                $any_path_last_entity: {
                    type: 'string',
                    const: any_path_entity,
                },
                $any_path: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 2,
                    prefixItems: [
                        {
                            type: 'array',
                            items: {
                                $ref: `#/$defs/entity_name`,
                            },
                        },
                        {
                            $ref: `#/properties/${any_path_entity}/properties/${clause_type}`,
                        },
                    ],
                },
            },
        })),
    }
    return any_path_schema
}

const get_where_field_schema = (
    orma_schema: OrmaSchema,
    entity_name: string,
    clause_type: '$where' | '$having'
) => {
    const field_names = get_field_names(entity_name, orma_schema)

    const field_schema =
        clause_type === '$having'
            ? {
                  anyOf: get_expression_schemas(orma_schema, entity_name),
              }
            : {
                  type: 'string',
                  enum: field_names,
              }

    return field_schema
}

const get_operation_schema = (
    orma_schema: OrmaSchema,
    entity_name: string,
    clause_type: '$where' | '$having'
) => {
    const primitive_value_schema = {
        anyOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { type: 'null' },
        ],
    }

    const operation_argument_schema = {
        anyOf: [
            {
                $ref: `#/$defs/entities/${entity_name}/${clause_type}/field`,
            },
            {
                type: 'object',
                additionalProperties: false,
                properties: {
                    $escape: primitive_value_schema,
                },
            },
        ],
    }

    const operation_schema = {
        type: 'array',
        items: operation_argument_schema,
        minItems: 2,
        maxItems: 2,
    }

    return operation_schema
}

/**
 * Fills in extra data that is only used for validation. Mutates the input query
 */
export const preprocess_query_for_validation = (
    query: any,
    orma_schema: OrmaSchema
) => {
    deep_for_each(query, (value, path) => {
        if (value.$any_path) {
            value.$any_path_last_entity = last(value.$any_path[0])
        }
    })
}

/**
 * Removes extra data that was only used for validation. Mutates the input query
 */
export const postprocess_query_for_validation = (query: any) => {
    deep_for_each(query, (value, path) => {
        if (value.$any_path) {
            delete value.$any_path_last_entity
        }
    })
}

export const get_any_path_errors = (query: any, orma_schema: OrmaSchema) => {
    let all_errors: OrmaError[] = []

    deep_for_each(query, (value, path) => {
        if (value.$any_path) {
            const context_entity = get_any_path_context_entity(path, query)
            const any_path_entities: string[] = value.$any_path?.[0] ?? []
            const any_path_errors = any_path_entities.flatMap(
                (any_path_entity, i) => {
                    const previous_entity =
                        i === 0 ? context_entity : value.$any_path[0][i - 1]
                    const is_valid_entity =
                        is_parent_entity(
                            any_path_entity,
                            previous_entity,
                            orma_schema
                        ) ||
                        is_parent_entity(
                            previous_entity,
                            any_path_entity,
                            orma_schema
                        )

                    if (is_valid_entity) {
                        return []
                    } else {
                        const error: OrmaError = {
                            message: `Entity ${any_path_entity} must be a parent or a child of the previous entity, ${previous_entity}.`,
                        }
                        return [error]
                    }
                }
            )

            all_errors.push(...any_path_errors)
        }
    })

    return all_errors
}

export const validate_where_connected = (
    query: any,
    orma_schema: OrmaSchema
) => {
    let errors: OrmaError[] = []

    if (query.$where_connected) {
        query.$where_connected.forEach(({ $entity, $field, $values }) => {
            if (!is_entity_name($entity, orma_schema)) {
                errors.push({
                    message: `${$entity} is not a valid entity name.`,
                    additional_info: {
                        valid_entities: get_entity_names(orma_schema),
                    },
                    original_data: query,
                    path: ['$where_connected', '$entity'],
                })
            } else if (!is_field_name($entity, $field, orma_schema)) {
                errors.push({
                    message: `${$entity} is not the name of a field for the entity ${$entity}.`,
                    additional_info: {
                        valid_entities: get_entity_names(orma_schema),
                    },
                    original_data: query,
                    path: ['$where_connected', '$field'],
                })
            }
        })
    }

    return errors
}

/*
TODO in regular js (because JSON schema doesnt support them, or other reasons)

- Add $from based on key names matching an entity (handled by doing macro before validation)
- Check that the selected fields match what is in the group_by if applicable (deep equality for sql function asts?) (skipping for now, will just result in an sql error)
- validation for all operations (we can't check anything, since we can't access the custom keys so we don't know
  what exactly is valid in the having clause for 'as' aliased)
- check that the entity path of $any_path is valid
- add an $any_path_last_entity field for validation purposes


Features that are currently disabled due to validation:
- referencing aliases in a having clause, e.g. this is illegal
    {
        my_sum: {
            $sum: 'quantity'
        },
        having: {
            $gt: ['my_sum', { escape: 0 }]
        }
    }

    but this is fine
    {
        my_sum: {
            $sum: 'quantity'
        },
        having: {
            $gt: [{
                $sum: 'quantity'
            }, { escape: 0 }]
        }
    }



*/

/*

    new syntax ideas:
    
    {
        $where_connected: {
            vendors: [1, 3, 4],
            warehouses: [66, 12]
        }
    }

    {
        $foreign_key: ['waraehouse_id_origin']
    }
*/
