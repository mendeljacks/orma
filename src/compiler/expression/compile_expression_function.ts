import { OrmaError } from '../../helpers/error_handling'
import { escape_value } from '../../helpers/escape'
import { GetAllTables } from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { OrmaQueryAliases } from '../../types/query/query_types'
import { format_value } from '../common/message_formatting'
import { validate } from '../common/validator'
import { QueryCompilerArgs, QueryValidatorArgs } from '../compiler'
import { sql_to_typescript_types } from '../data_definition/sql_data_types'
import {
    compile_expression,
    Expression,
    validate_expression
} from './compile_expression'

// TODO: handle escaping column and table names and make sure this applies to DDL compilers too
export const compile_expression_function = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    statement,
    table_name
}: QueryCompilerArgs<
    Schema,
    ExpressionFunction<Schema, Aliases, Table>
>): string => {
    const database_type = orma_schema.tables[table_name].database_type

    if ('add' in statement) {
        return statement.add
            .map(el =>
                compile_expression({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(' + ')
    }

    if ('avg' in statement) {
        return `AVG(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.avg
        })})`
    }

    if ('cast' in statement) {
        return `CAST(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.cast[0]
        })} AS ${statement.cast[1]})`
    }

    if ('ceil' in statement) {
        return `CEIL(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.ceil
        })})`
    }

    if ('coalesce' in statement) {
        return `COALESCE(${statement.coalesce
            .map(el =>
                compile_expression({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(', ')})`
    }

    if ('concat' in statement) {
        // TODO: Make sure concat supports NOT, like NOT (CONCAT(...))
        return `CONCAT(${statement.concat
            .map(el =>
                compile_expression({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(', ')})`
    }

    if ('count' in statement) {
        if (statement.count === '*') {
            return `COUNT(*)`
        }

        return `COUNT(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.count
        })})`
    }

    if ('current_timestamp' in statement) {
        return 'CURRENT_TIMESTAMP'
    }

    if ('date' in statement) {
        return `COUNT(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.date
        })})`
    }

    if ('divide' in statement) {
        return `CONCAT(${statement.divide
            .map(el =>
                compile_expression({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(' / ')})`
    }

    if ('floor' in statement) {
        return `COUNT(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.floor
        })})`
    }

    if ('group_concat' in statement) {
        const distinct_string = statement.distinct ? 'DISTINCT ' : ''
        const expressions_string = statement.group_concat
            .map(el =>
                compile_expression({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(', ')
        // TODO: implement this by reusing order by from query
        // const order_by_string = statement.order_by?.map(el => )
        const separator_string = statement.separator
            ? ` SEPARATOR ${escape_value(database_type, statement.separator)}`
            : ''

        // TODO: add order by to string
        return `${distinct_string}${expressions_string}${separator_string}`
    }

    if ('if' in statement) {
        return `IF(${statement.if
            .map(el =>
                compile_expression({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(', ')})`
    }

    if ('lower' in statement) {
        return `LOWER(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.lower
        })})`
    }

    if ('max' in statement) {
        return `MAX(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.max
        })})`
    }

    if ('min' in statement) {
        return `MIN(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.min
        })})`
    }

    if ('multiply' in statement) {
        return `${statement.multiply
            .map(el =>
                compile_expression({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(' * ')}`
    }

    if ('round' in statement) {
        return `ROUND(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.round
        })})`
    }

    if ('st_distance' in statement) {
        return `ST_Distance(${statement.st_distance
            .map(el =>
                compile_expression({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(', ')})`
    }

    if ('st_dwithin' in statement) {
        return `ST_Dwithin(${statement.st_dwithin
            .map(el =>
                compile_expression({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(', ')})`
    }

    if ('subtract' in statement) {
        return `${statement.subtract
            .map(el =>
                compile_expression({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(' - ')}`
    }

    if ('sum' in statement) {
        return `SUM(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.sum
        })})`
    }

    if ('upper' in statement) {
        return `UPPER(${compile_expression({
            orma_schema,
            table_name,
            statement: statement.upper
        })})`
    }

    throw new Error('Unrecognized expression function.')
}

export const validate_expression_function = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    statement,
    aliases_by_table,
    path,
    table_name
}: QueryValidatorArgs<Schema, ExpressionFunction<Schema, Aliases, Table>> & {
    table_name: Table
}): OrmaError[] | undefined => {
    if ('add' in statement) {
        const function_errors = validate(
            {
                type: 'object',
                properties: { add: { type: 'array', minItems: 1 } }
            },
            path,
            statement
        )
        const argument_errors =
            statement?.add?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'add', i],
                    table_name
                })
            ) ?? []
        return [...function_errors, ...argument_errors]
    }

    if ('avg' in statement) {
        return validate_expression({
            orma_schema,
            statement: statement.avg,
            aliases_by_table,
            path: [...path, 'avg'],
            table_name
        })
    }

    if ('cast' in statement) {
        const function_errors = validate(
            {
                type: 'object',
                properties: {
                    cast: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 2,
                        prefixItems: [
                            {},
                            {
                                enum: new Set(
                                    Object.keys(sql_to_typescript_types)
                                )
                            }
                        ]
                    }
                }
            },
            path,
            statement
        )
        const argument_errors = validate_expression({
            orma_schema,
            statement: statement.cast?.[0],
            aliases_by_table,
            path: [...path, 'cast', 0],
            table_name
        })

        return [...function_errors, ...argument_errors]
    }

    if ('ceil' in statement) {
        return validate_expression({
            orma_schema,
            statement: statement.ceil,
            aliases_by_table,
            path: [...path, 'ceil'],
            table_name
        })
    }

    if ('coalesce' in statement) {
        const function_errors = validate(
            {
                type: 'object',
                properties: { coalesce: { type: 'array', minItems: 1 } }
            },
            path,
            statement
        )
        const argument_errors =
            statement?.coalesce?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'coalesce', i],
                    table_name
                })
            ) ?? []
        return [...function_errors, ...argument_errors]
    }

    if ('concat' in statement) {
        // TODO: Make sure concat supports NOT, like NOT (CONCAT(...))
        const function_errors = validate(
            {
                type: 'object',
                properties: { concat: { type: 'array', minItems: 1 } }
            },
            path,
            statement
        )
        const argument_errors =
            statement?.concat?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'concat', i],
                    table_name
                })
            ) ?? []
        return [...function_errors, ...argument_errors]
    }

    if ('count' in statement) {
        if (statement.count === '*') {
            return []
        }

        return validate_expression({
            orma_schema,
            statement: statement.count,
            aliases_by_table,
            path: [...path, 'count'],
            table_name
        })
    }

    if ('current_timestamp' in statement) {
        return validate(
            {
                type: 'object',
                properties: { current_timestamp: { const: true } }
            },
            path,
            statement
        )
    }

    if ('date' in statement) {
        return validate_expression({
            orma_schema,
            statement: statement.date,
            aliases_by_table,
            path: [...path, 'date'],
            table_name
        })
    }

    if ('divide' in statement) {
        const function_errors = validate(
            {
                type: 'object',
                properties: {
                    divide: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 2
                    }
                }
            },
            path,
            statement
        )
        const argument_errors =
            statement?.divide?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'divide', i],
                    table_name
                })
            ) ?? []
        return [...function_errors, ...argument_errors]
    }

    if ('floor' in statement) {
        return validate_expression({
            orma_schema,
            statement: statement.floor,
            aliases_by_table,
            path: [...path, 'floor'],
            table_name
        })
    }

    if ('group_concat' in statement) {
        const function_errors = validate(
            {
                type: 'object',
                properties: {
                    group_concat: { type: 'array', minItems: 1 },
                    distinct: { type: 'boolean' },
                    order_by: {}, // TODO: validate order by using the same logic as query
                    separator: { type: 'string' }
                }
            },
            path,
            statement
        )
        const argument_errors =
            statement?.group_concat?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'group_concat', i],
                    table_name
                })
            ) ?? []
        return [...function_errors, ...argument_errors]
    }

    if ('if' in statement) {
        const function_errors = validate(
            {
                type: 'object',
                properties: {
                    if: {
                        type: 'array',
                        minItems: 3,
                        maxItems: 3
                    }
                }
            },
            path,
            statement
        )
        const argument_errors =
            statement?.if?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'if', i],
                    table_name
                })
            ) ?? []
        return [...function_errors, ...argument_errors]
    }

    if ('lower' in statement) {
        return validate_expression({
            orma_schema,
            statement: statement.lower,
            aliases_by_table,
            path: [...path, 'lower'],
            table_name
        })
    }

    if ('max' in statement) {
        return validate_expression({
            orma_schema,
            statement: statement.max,
            aliases_by_table,
            path: [...path, 'max'],
            table_name
        })
    }

    if ('min' in statement) {
        return validate_expression({
            orma_schema,
            statement: statement.min,
            aliases_by_table,
            path: [...path, 'min'],
            table_name
        })
    }

    if ('multiply' in statement) {
        const function_errors = validate(
            {
                type: 'object',
                properties: { multiply: { type: 'array', minItems: 1 } }
            },
            path,
            statement
        )
        const argument_errors =
            statement?.multiply?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'multiply', i],
                    table_name
                })
            ) ?? []
        return [...function_errors, ...argument_errors]
    }

    if ('round' in statement) {
        return validate_expression({
            orma_schema,
            statement: statement.round,
            aliases_by_table,
            path: [...path, 'round'],
            table_name
        })
    }

    if ('st_distance' in statement) {
        const function_errors = validate(
            {
                type: 'object',
                properties: {
                    st_distance: { type: 'array', minItems: 2, maxItems: 3 }
                }
            },
            path,
            statement
        )
        const argument_errors =
            statement?.st_distance?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'st_distance', i],
                    table_name
                })
            ) ?? []
        return [...function_errors, ...argument_errors]
    }

    if ('st_dwithin' in statement) {
        const function_errors = validate(
            {
                type: 'object',
                properties: {
                    st_dwithin: { type: 'array', minItems: 2, maxItems: 3 }
                }
            },
            path,
            statement
        )
        const argument_errors =
            statement?.st_dwithin?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'st_dwithin', i],
                    table_name
                })
            ) ?? []
        return [...function_errors, ...argument_errors]
    }

    if ('subtract' in statement) {
        const function_errors = validate(
            {
                type: 'object',
                properties: {
                    subtract: { type: 'array', minItems: 2, maxItems: 2 }
                }
            },
            path,
            statement
        )
        const argument_errors =
            statement?.subtract?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'subtract', i],
                    table_name
                })
            ) ?? []
        return [...function_errors, ...argument_errors]
    }

    if ('sum' in statement) {
        return validate_expression({
            orma_schema,
            statement: statement.sum,
            aliases_by_table,
            path: [...path, 'sum'],
            table_name
        })
    }

    if ('upper' in statement) {
        return validate_expression({
            orma_schema,
            statement: statement.upper,
            aliases_by_table,
            path: [...path, 'upper'],
            table_name
        })
    }

    return undefined
}

export type ExpressionFunction<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> =
    | { readonly add: readonly Expression<Schema, Aliases, Table>[] }
    | { readonly avg: Expression<Schema, Aliases, Table> }
    | {
          readonly cast: [
              Expression<Schema, Aliases, Table>,
              keyof typeof sql_to_typescript_types
          ]
      }
    | { readonly ceil: Expression<Schema, Aliases, Table> }
    | { readonly coalesce: readonly Expression<Schema, Aliases, Table>[] }
    | { readonly concat: readonly Expression<Schema, Aliases, Table>[] }
    | { readonly cast_signed: Expression<Schema, Aliases, Table> }
    | { readonly concat: readonly Expression<Schema, Aliases, Table>[] }
    | { readonly count: Expression<Schema, Aliases, Table> | '*' }
    | { readonly current_timestamp: true }
    | { readonly date: Expression<Schema, Aliases, Table> }
    | {
          readonly divide: [
              Expression<Schema, Aliases, Table>,
              Expression<Schema, Aliases, Table>
          ]
      }
    | { readonly floor: Expression<Schema, Aliases, Table> }
    | {
          readonly group_concat: readonly Expression<Schema, Aliases, Table>[]
          readonly distinct?: boolean
          // TODO: add order by type here
          readonly separator?: string
      }
    | {
          readonly if: readonly [
              Expression<Schema, Aliases, Table>,
              Expression<Schema, Aliases, Table>,
              Expression<Schema, Aliases, Table>
          ]
      }
    | { readonly lower: Expression<Schema, Aliases, Table> }
    | { readonly max: Expression<Schema, Aliases, Table> }
    | { readonly min: Expression<Schema, Aliases, Table> }
    | { readonly multiply: readonly Expression<Schema, Aliases, Table>[] }
    | { readonly round: Expression<Schema, Aliases, Table> }
    | { readonly st_distance: readonly Expression<Schema, Aliases, Table>[] }
    | { readonly st_dwithin: readonly Expression<Schema, Aliases, Table>[] }
    | {
          readonly subtract: readonly [
              Expression<Schema, Aliases, Table>,
              Expression<Schema, Aliases, Table>
          ]
      }
    | {
          readonly sum: Expression<Schema, Aliases, Table>
      }
    | {
          readonly upper: Expression<Schema, Aliases, Table>
      }
