import { OrmaError } from '../../helpers/error_handling'
import { escape_identifier, escape_value } from '../../helpers/escape'
import {
    get_column_names,
    get_is_column_name,
    get_is_table_name
} from '../../helpers/schema_helpers'
import { GetAllTables, GetColumns } from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { GetAliases, OrmaQueryAliases } from '../../types/query/query_types'
import { format_value } from '../common/message_formatting'
import { validate } from '../common/validator'
import { QueryCompilerArgs, QueryValidatorArgs } from '../compiler'
import {
    compile_expression,
    Expression,
    validate_expression
} from '../expression/compile_expression'
import { compile_where, Where } from './compile_where'

export const compile_select = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
>({
    orma_schema,
    statement
}: {
    orma_schema: Schema
    statement: Select<Schema, Aliases>
}) => {
    const database_type = orma_schema.tables[statement.from].database_type

    const select_all_strings =
        statement.select_all === true
            ? ['*']
            : Array.isArray(statement.select_all)
            ? statement.select_all.map(
                  el => `${escape_identifier(database_type, el)}.*`
              )
            : []

    const select_strings = Object.keys(statement.select ?? {})
        .map(key => {
            const value = statement.select![key]
            if (value === undefined) {
                return undefined
            }

            if (typeof value === 'boolean') {
                return escape_identifier(database_type, key)
            }

            return `${compile_expression({
                orma_schema,
                table_name: statement.from,
                statement: value
            })} AS ${escape_identifier(database_type, key)}`
        })
        .filter(el => el !== undefined)
        .concat(select_all_strings)

    const where_string = statement.where
        ? ` WHERE ${compile_where({
              orma_schema,
              table_name: statement.from,
              statement: statement.where
          })}`
        : ''

    const group_by_string = statement.group_by
        ? ` GROUP BY ${statement.group_by
              .map(el =>
                  compile_expression({
                      orma_schema,
                      table_name: statement.from,
                      statement: el
                  })
              )
              .join(', ')}`
        : ''

    const having_string = statement.having
        ? ` HAVING ${compile_where({
              orma_schema,
              table_name: statement.from,
              statement: statement.having
          })}`
        : ''

    const order_by_string = statement.order_by
        ? ` ORDER BY ${statement.order_by
              .map(el => {
                  if ('asc' in el) {
                      return `${compile_expression({
                          orma_schema,
                          table_name: statement.from,
                          statement: el.asc
                      })} ASC`
                  } else {
                      return `${compile_expression({
                          orma_schema,
                          table_name: statement.from,
                          statement: el.desc
                      })} DESC`
                  }
              })
              .join(', ')}`
        : ''

    const limit_string = statement.limit
        ? ` LIMIT ${escape_value(database_type, statement.limit)}`
        : ''

    const offset_string = statement.offset
        ? ` LIMIT ${escape_value(database_type, statement.offset)}`
        : ''

    return `SELECT ${select_strings.join(', ')} FROM ${escape_identifier(
        database_type,
        statement.from
    )}${where_string}${group_by_string}${having_string}${order_by_string}${limit_string}${offset_string}`
}

export const validate_select = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
>({
    orma_schema,
    statement,
    path,
    aliases_by_table,
    require_one_select = false
}: QueryValidatorArgs<Schema, Select<Schema, Aliases>> & {
    require_one_select?: boolean
}): OrmaError[] => {
    const base_errors = validate(
        {
            type: 'object',
            properties: {
                select: {
                    type: 'object'
                },
                select_all: {
                    anyOf: [
                        { type: 'boolean' },
                        { type: 'array', items: { type: 'string' } }
                    ]
                },
                from: { type: 'string' },
                limit: { type: 'integer', minimum: 0 },
                offset: { type: 'integer', minimum: 0 },
                group_by: { type: 'array' },
                order_by: {
                    type: 'array',
                    items: {
                        oneOf: [
                            {
                                type: 'object',
                                required: ['asc']
                            },
                            {
                                type: 'object',
                                required: ['desc']
                            }
                        ]
                    }
                }
            },
            required: ['from']
        },
        path,
        statement
    )

    // const select_all_fields = statement.select_all === true ? get_column_names(orma_schema, statement.from) :
    // const select_fields = Object.keys(statement.select ?? {})

    const selected_fields = Object.keys(statement.select ?? {})
    const one_field_selected =
        selected_fields.length === 1 && !statement.select_all
    // this is used for where ins, where only one column can be selected or you get an sql error
    if (require_one_select && !one_field_selected) {
        return [
            {
                message: `Exactly one column must be selected and select_all cannot be used for this query.`,
                path
            } as OrmaError
        ]
    }

    const selected_field_errors = selected_fields.flatMap(field => {
        const value = statement.select![field]
        if (value === undefined) {
            // undefined can be safely ignored
            return []
        }

        const is_column_name = get_is_column_name(
            orma_schema,
            statement.from,
            field
        )
        if (typeof value === 'boolean') {
            if (!is_column_name) {
                return [
                    {
                        message: `Selected column ${format_value(
                            field
                        )} is not a valid column name of table ${format_value(
                            statement.from
                        )}.`,
                        path: [...path, 'select']
                    } as OrmaError
                ]
            } else {
                return []
            }
        }

        return validate_expression({
            orma_schema,
            aliases_by_table,
            path: [...path, 'select', field],
            table_name: statement.from,
            statement: value
        })
    })

    const has_select_errors =
        !statement.select && !statement.select_all
            ? [
                  {
                      message: 'Query must have a select or select_all prop.',
                      path: path
                  } as OrmaError
              ]
            : []

    const select_all_errors = Array.isArray(statement.select_all)
        ? statement.select_all
              .filter(el => !get_is_table_name(orma_schema, el))
              .map(
                  (el, i) =>
                      ({
                          message: `${format_value(
                              el
                          )} is not a valid table name.`,
                          path: [...path, 'select_all', i]
                      } as OrmaError)
              )
        : []

    const from_errors = get_is_table_name(orma_schema, statement.from)
        ? []
        : [
              {
                  message: `From value ${format_value(
                      statement.from
                  )} is not a valid table name.`,
                  path: [...path, 'from']
              } as OrmaError
          ]

    const group_by_errors =
        statement.group_by?.flatMap((el, i) =>
            validate_expression({
                orma_schema,
                aliases_by_table,
                path: [...path, 'group_by', i],
                table_name: statement.from,
                statement: el
            })
        ) ?? []

    const order_by_errors =
        statement.order_by?.flatMap((el, i) => {
            if ('asc' in el && 'desc' in el) {
                return [
                    {
                        message:
                            "Order by must have only one of the properties 'asc' or 'desc'"
                    } as OrmaError
                ]
            }

            if ('asc' in el) {
                return validate_expression({
                    orma_schema,
                    aliases_by_table,
                    path: [...path, 'order_by', i],
                    table_name: statement.from,
                    statement: el.asc
                })
            }

            if ('desc' in el) {
                return validate_expression({
                    orma_schema,
                    aliases_by_table,
                    path: [...path, 'order_by', i],
                    table_name: statement.from,
                    statement: el.desc
                })
            }

            return []
        }) ?? []

    return [
        ...base_errors,
        ...has_select_errors,
        ...selected_field_errors,
        ...select_all_errors,
        ...from_errors,
        ...group_by_errors,
        ...order_by_errors
    ]
}

export type Select<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
> = SelectForTables<Schema, Aliases, GetAllTables<Schema>>

type SelectForTables<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Tables extends GetAllTables<Schema>
> = Tables extends GetAllTables<Schema>
    ? SelectForTable<Schema, Aliases, Tables>
    : never

// TODO: test select all
type SelectForTable<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = {
    readonly select?: ColumnObj<Schema, Aliases, Table>
    readonly select_all?: boolean | GetAllTables<Schema>[]
    readonly from: Table
    readonly limit?: number
    readonly offset?: number
    readonly group_by?: readonly Expression<Schema, Aliases, Table>[]
    readonly order_by?: readonly (
        | {
              readonly asc: Expression<Schema, Aliases, Table>
          }
        | {
              readonly desc: Expression<Schema, Aliases, Table>
          }
    )[]
    readonly where?: Where<Schema, Aliases, Table>
    readonly having?: Where<Schema, Aliases, Table>
    // readonly nest?: {
    //     readonly [Subtable in GetConnectedTables<
    //         Schema,
    //         Table
    //     >]?: SelectForTable<Schema, Aliases, Subtable>
    // }
}

type ColumnObj<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = {
    readonly [Column in GetColumns<Schema, Table>]?:
        | boolean
        | Expression<Schema, Aliases, Table>
} & {
    readonly [Alias in GetAliases<Schema, Aliases, Table>]?: Expression<
        Schema,
        Aliases,
        Table
    >
}