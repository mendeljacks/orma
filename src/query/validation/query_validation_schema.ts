import { sql_function_definitions } from '../json_sql'

const primitive_schema = {
    oneOf: [
        {
            type: 'string',
        },
        {
            type: 'boolean',
        },
        {
            type: 'number',
        },
        {
            type: 'null',
        },
    ],
}

const expression_schema = {
    anyOf: [
        {
            // expression can be the name of a field
            type: 'string',
        },
        // or an sql function
        ...Object.keys(sql_function_definitions).map(function_name => {
            const sql_function_definition =
                sql_function_definitions[function_name]

            const inner_schema = sql_function_definition.multiple_args
                ? [
                      {
                          type: 'array',
                          items: {
                              $ref: '#/$defs/expression',
                          },
                      },
                  ]
                : [
                      {
                          $ref: '#/$defs/expression',
                      },
                  ]

            const distinct_schema = sql_function_definition.allow_distinct
                ? [
                      {
                          $type: 'object',
                          properties: {
                              $distinct: inner_schema,
                          },
                          additionalProperties: false,
                      },
                  ]
                : []

            const star_schema = sql_function_definition.allow_star
                ? [
                      {
                          const: '*',
                      },
                  ]
                : []

            const field_schema = {
                type: 'object',
                properties: {
                    [function_name]: inner_schema,
                },
                additionalProperties: false,
            }

            const schemas = [...distinct_schema, ...star_schema, field_schema]

            return schemas.length > 0
                ? {
                      oneOf: schemas,
                  }
                : schemas
        }),
        // or an escaped value
        {
            type: 'object',
            properties: {
                $escape: primitive_schema,
            },
            additionalProperties: false,
        },
        // or a subquery
        {
            $ref: '#/$defs/inner_query',
        },
    ],
}

const order_by_schema = {
    type: 'array',
    items: {
        anyOf: [
            {
                type: 'object',
                additionalProperties: false,
                properties: {
                    $asc: {
                        $ref: '#/$defs/expression',
                    },
                },
            },
            {
                type: 'object',
                additionalProperties: false,
                properties: {
                    $desc: {
                        $ref: '#/$defs/expression',
                    },
                },
            },
        ],
    },
}

const group_by_schema = {
    type: 'array',
    items: {
        $ref: '#/$defs/expression',
    },
}

const operation_schema = {
    type: 'array',
    items: {
        $ref: `#/$defs/expression`,
    },
    minItems: 2,
    maxItems: 2,
}

const where_schema = {
    oneOf: [
        { $eq: operation_schema },
        { $gt: operation_schema },
        { $lt: operation_schema },
        { $gte: operation_schema },
        { $lte: operation_schema },
        { $like: operation_schema },
        {
            $and: {
                type: 'array',
                items: {
                    $ref: `#/$defs/where_clause`,
                },
            },
        },
        {
            $or: {
                type: 'array',
                items: {
                    $ref: `#/$defs/where_clause`,
                },
            },
        },
        {
            $in: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                prefixItems: [
                    {
                        $ref: `#/$defs/expression`,
                    },
                    {
                        oneOf: [
                            {
                                type: 'array',
                                minItems: 1,
                                items: {
                                    $ref: `#/$defs/expression`,
                                },
                            },
                            {
                                $ref: '#/$defs/inner_query',
                            },
                        ],
                    },
                ],
            },
        },
        {
            $not: {
                $ref: `#/$defs/where_clause`,
            },
        },
        {
            $any_path: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                prefixItems: [
                    {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    {
                        $ref: '#/$defs/where_clause',
                    },
                ],
            },
        },
    ].map(properties => ({
        type: 'object',
        additionalProperties: false,
        properties,
    })),
}

const query_shared_props = {
    $from: {
        type: 'string',
    },
    $limit: {
        type: 'number',
        minimum: 0,
    },
    $offset: {
        type: 'number',
        minimum: 0,
    },
    $order_by: order_by_schema,
    $group_by: group_by_schema,
    $where: {
        $ref: '#/$defs/where_clause',
    },
    $having: {
        $ref: '#/$defs/where_clause',
    },
}

// outer queries are regular queries like { products: { id: true }}
const outer_query_schema = {
    type: 'object',
    // there are 5 cases for data properties:
    //   1. key is a field, value is a boolean. In this case the key will end up in the $select
    //   2. value is a field name. In this case the value will end up in the select
    //   3. value is an object with an SQL function (e.g. {$sum: 'field'})
    //   4. key is an entity name, value is a subquery (doesnt need a $from clause). The subquery is from the
    //      entity in key name
    //   5. value is a subquery with a $from clause (e.g. { id: true, $from: 'my_table'}). The subquery is from the
    //      entity in the $from clause
    additionalProperties: {
        anyOf: [
            {
                // this covers case 1
                type: 'boolean',
            },
            {
                // this covers cases 2 and 3
                $ref: '#/$defs/expression',
            },
            {
                // this covers cases 4 and 5
                $ref: '#/$defs/outer_query',
            },
        ],
    },
    // known properties of a query
    properties: query_shared_props,
}

// inner queries dont have property selects, nesting etc and are used inside where clauses, e.g.
// { $where: { $in: ['id', { $select: [...], $from: ... }]}}
const inner_query_schema = {
    type: 'object',
    properties: {
        $select: {
            type: 'array',
            minItems: 1,
            items: {
                $ref: '#/$defs/expression',
            },
        },
        ...query_shared_props,
    },
    additionalProperties: false,
}

const where_connected_schema = {
    type: 'array',
    minItems: 1,
    items: {
        type: 'object',
        properties: {
            $entity: {
                type: 'string',
            },
            $field: {
                type: 'string',
            },
            $values: {
                type: 'array',
                minItems: 1,
                items: primitive_schema,
            },
        },
        additionalProperties: false,
    },
}

export const query_validation_schema = {
    $defs: {
        // expressions resolve to values, such as a field name, $sum: 'quantity' or an escaped value such as $escape: 'hi'
        expression: expression_schema,
        where_clause: where_schema,
        outer_query: outer_query_schema,
        inner_query: inner_query_schema,
    },
    type: 'object',
    properties: {
        $where_connected: where_connected_schema,
    },
    additionalProperties: {
        $ref: '#/$defs/outer_query',
    },
}
