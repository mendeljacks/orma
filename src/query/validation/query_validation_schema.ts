import { sql_function_definitions } from '../json_sql'

const alias_regex = '^[A-Za-z0-9_$]+$' // alphanumeric and _

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
        {
            // or an entity / field combo
            type: 'object',
            properties: {
                $entity: {
                    type: 'string',
                },
                $field: {
                    type: 'string',
                },
            },
            required: ['$entity', '$field'],
            additionalProperties: false,
        },
        // or an sql function
        ...Object.keys(sql_function_definitions).map(function_name => {
            const sql_function_definition =
                sql_function_definitions[function_name]

            const inner_schema =
                sql_function_definition.max_args === 0
                    ? [] // in this case we only allow true, which is handled in the true_schema
                    : sql_function_definition.max_args === 1
                    ? [
                          {
                              $ref: '#/$defs/expression',
                          },
                      ]
                    : [
                          {
                              type: 'array',
                              minItems: sql_function_definition.min_args,
                              maxItems: sql_function_definition.max_args,
                              items: {
                                  $ref: '#/$defs/expression',
                              },
                          },
                      ]

            // if no args are allowed, we must use true as a placeholder for the json value. If multiple args are allowed,
            // we can provide no args with just an empty array [], so we dont allow true in that case. But if there is only
            // one arg, then we dont wrap the arg in an array, so to provide nothing we use true
            const true_schema =
                (sql_function_definition.min_args === 0 &&
                    sql_function_definition.max_args === 1) ||
                sql_function_definition.max_args === 0
                    ? [
                          {
                              const: true,
                          },
                      ]
                    : []

            const distinct_schema = sql_function_definition.allow_distinct
                ? [
                      {
                          $type: 'object',
                          properties: {
                              $distinct: inner_schema,
                          },
                          required: ['distinct'],
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
                required: [function_name],
                additionalProperties: false,
            }

            const schemas = [
                ...true_schema,
                ...distinct_schema,
                ...star_schema,
                field_schema,
            ]

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
                $escape: {
                    $ref: '#/$defs/primitive',
                },
            },
            required: ['$escape'],
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
                minItems: 1,
            },
        },
        {
            $or: {
                type: 'array',
                items: {
                    $ref: `#/$defs/where_clause`,
                },
                minItems: 1,
            },
        },
        {
            $in: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: [
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
                            {
                                type: 'object',
                                properties: {
                                    $escape: {
                                        type: 'array',
                                        minItems: 1,
                                        items: {
                                            $ref: '#/$defs/primitive',
                                        },
                                    },
                                },
                                additionalProperties: false,
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
                items: [
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
    $select: {
        type: 'array',
        minItems: 1,
        items: {
            anyOf: [
                {
                    $ref: '#/$defs/expression',
                },
                {
                    type: 'object',
                    properties: {
                        $as: {
                            type: 'array',
                            minItems: 2,
                            maxItems: 2,
                            items: [
                                {
                                    $ref: '#/$defs/expression',
                                },
                                {
                                    minLength: 1,
                                    type: 'string',
                                    pattern: alias_regex,
                                },
                            ],
                        },
                    },
                    additionalProperties: false,
                },
            ],
        },
    },
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
    // there are 5 cases for data properties:
    //   1. key is a field, value is a boolean. In this case the key will end up in the $select
    //   2. value is a field name. In this case the value will end up in the select
    //   3. value is an object with an SQL function (e.g. {$sum: 'field'})
    //   4. key is an entity name, value is a subquery (doesnt need a $from clause). The subquery is from the
    //      entity in key name
    //   5. value is a subquery with a $from clause (e.g. { id: true, $from: 'my_table'}). The subquery is from the
    //      entity in the $from clause
    type: 'object',
    patternProperties: {
        [alias_regex]: {
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
    },
    additionalProperties: false,
    // known properties of a query
    properties: {
        ...query_shared_props,
        $foreign_key: { type: 'array', minItems: 1, items: { type: 'string' } },
    },
}

// inner queries dont have property selects, nesting etc and are used inside where clauses, e.g.
// { $where: { $in: ['id', { $select: [...], $from: ... }]}}
const inner_query_schema = {
    type: 'object',
    properties: {
        ...query_shared_props,
    },
    required: ['$select', '$from'],
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
                items: {
                    $ref: '#/$defs/primitive',
                },
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
        primitive: primitive_schema,
    },
    type: 'object',
    properties: {
        $where_connected: where_connected_schema,
    },
    additionalProperties: {
        $ref: '#/$defs/outer_query',
    },
}
