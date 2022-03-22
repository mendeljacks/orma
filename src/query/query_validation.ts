import { JSONSchemaType } from 'ajv'
import {
    get_all_edges,
    get_entity_names,
    get_field_names,
} from '../helpers/schema_helpers'
import { orma_schema } from '../introspector/introspector'

export const get_query_schema = (orma_schema: orma_schema) => {
    const entity_names = get_entity_names(orma_schema)

    const schema = {
        type: 'object',
        // discriminator speeds up validation (discriminator is an OpenAPI keyword, but not part of JSON Schema)
        discriminator: { propertyName: '$from' },
        properties: entity_names.reduce((acc, entity_name) => {
            acc[entity_name] = get_entity_schema(orma_schema, entity_name)
            return acc
        }, {}),
        patternProperties: {
            // this regex key matches anything. There are no restrictions on the key since
            // a $from clause will be required in the subschema
            '': {
                anyOf: entity_names.map(entity_name => ({
                    $ref: `#/properties/${entity_name}`,
                })),
            },
        },
        additionalProperties: false,
    }

    return schema
}

const get_entity_schema = (orma_schema: orma_schema, entity_name: string) => {
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
            $group_by: get_expression_schemas(orma_schema, entity_name),
            $where: get_where_schema(orma_schema, entity_name, 'where'),
            $having: get_where_schema(orma_schema, entity_name, 'having'),
        },
        patternProperties: {
            '': {
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
        },
        additionalProperties: false,
        required: ['$from'],
    }

    field_names.forEach(field_name => {
        entity_schema.properties[field_name] = {
            type: 'boolean',
        }
    })

    return entity_schema
}

const get_order_by_schema = (orma_schema: orma_schema, entity_name: string) => {
    const order_by_schema = {
        anyOf: [
            ...get_expression_schemas(orma_schema, entity_name),
            {
                type: 'object',
                additionalProperties: false,
                properties: {
                    $asc: {
                        anyOf: get_expression_schemas(orma_schema, entity_name),
                    },
                },
            },
            {
                type: 'object',
                additionalProperties: false,
                properties: {
                    $desc: {
                        anyOf: get_expression_schemas(orma_schema, entity_name),
                    },
                },
            },
        ],
    }

    return order_by_schema
}

// expressions resolve to fields, such as $sum or just a field name string
const get_expression_schemas = (
    orma_schema: orma_schema,
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
            $sum: {
                type: 'string',
                enum: field_names,
            },
            additionalProperties: false,
        },
    ]
}

const get_where_schema = (
    orma_schema: orma_schema,
    entity_name: string,
    where_type: 'having' | 'where'
) => {
    const field_names = get_field_names(entity_name, orma_schema)
    const entity_names = get_entity_names(orma_schema)

    const field_schema =
        where_type === 'having'
            ? {
                  anyOf: get_expression_schemas(orma_schema, entity_name),
              }
            : {
                  type: 'string',
                  enum: field_names,
              }

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
            field_schema,
            {
                type: 'object',
                additionalItems: false,
                properties: {
                    $escape: primitive_value_schema,
                },
            },
        ],
    }

    const operation_schema = {
        type: 'array',
        prefixItems: [operation_argument_schema, operation_argument_schema],
        minItems: 2,
        maxItems: 2,
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
                    field_schema,
                    {
                        type: 'array',
                        items: field_schema,
                    },
                ],
            },
        },
        { $not: this_schema },
    ]

    const any_path_schema = {
        oneOf: entity_names.map(any_path_entity => ({
            type: 'object',
            additionalProperties: false,
            discriminator: { propertyName: '$any_path_last_entity' },
            required: ['$any_path_last_entity'],
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
                                type: 'string',
                                enum: entity_names,
                            },
                        },
                        {
                            $ref: `#/properties/${any_path_entity}/properties/${where_type}`,
                        },
                    ],
                },
            },
        })),
    }

    const where_schema = {
        oneOf: [
            ...where_clauses.map(properties => ({
                type: 'object',
                additionalProperties: false,
                properties,
            })),
            any_path_schema,
        ],
    }

    return where_schema
}

const get_fields_schema = (orma_schema: orma_schema) => {}

/*
TODO in regular js (because JSON schema doesnt support them, or other reasons)

- Add $from based on key names matching an entity
- Check that the selected fields match what is in the group_by if applicable (deep equality for sql function asts?)
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
