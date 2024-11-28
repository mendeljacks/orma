import { OrmaError } from '../../helpers/error_handling'
import { escape_identifier, escape_value } from '../../helpers/escape'
import { is_array } from '../../helpers/helpers'
import {
    get_column_names,
    get_is_column_name
} from '../../helpers/schema_helpers'
import { GetAllTables, GetColumns } from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { Path } from '../../types'
import { GetAliases, OrmaQueryAliases } from '../../types/query/query_types'
import { format_value } from '../common/message_formatting'
import { validate } from '../common/validator'
import { QueryCompilerArgs, QueryValidatorArgs } from '../compiler'
import {
    compile_select,
    Select,
    validate_select
} from '../query/compile_select'
import {
    compile_expression_function,
    ExpressionFunction,
    validate_expression_function
} from './compile_expression_function'

// TODO: make sure subqueries get brackets around them like id IN (SELECT ...)
export const compile_expression = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    table_name,
    statement
}: QueryCompilerArgs<Schema, Expression<Schema, Aliases, Table>>): string => {
    const database_type = orma_schema.tables[table_name].database_type

    // column name
    if (typeof statement === 'string') {
        return escape_identifier(database_type, statement)
    }

    // table + column name
    if ('table' in statement) {
        const table = escape_identifier(database_type, statement.table)
        const column = escape_identifier(database_type, statement.column)
        return `${table}.${column}`
    }

    // escaped value
    if ('escape' in statement) {
        return escape_value(database_type, statement.escape)
    }

    if ('from' in statement) {
        return `(${compile_select({ orma_schema, statement })})`
    }

    // sql function
    return `${compile_expression_function({
        orma_schema,
        table_name,
        statement
    })}`
}

export const validate_expression = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    aliases_by_table,
    table_name,
    path,
    statement
}: QueryValidatorArgs<Schema, Expression<Schema, Aliases, Table>> & {
    table_name: Table
}): OrmaError[] => {
    // column name
    if (typeof statement === 'string') {
        return validate_column(table_name, statement, {
            orma_schema,
            aliases_by_table,
            path,
            statement
        })
    }

    // table + column name
    if ('table' in statement) {
        const tables_in_scope = Object.keys(aliases_by_table)
        const is_table_in_scope = tables_in_scope.includes(statement.table)
        if (!is_table_in_scope) {
            return [
                {
                    error_code: 'validation_error',
                    message: `"${statement.table}" is not an in-scope table name.`,
                    path,
                    additional_info: {
                        tables_in_scope
                    }
                } as OrmaError
            ]
        }

        return validate_column(statement.table, statement.column, {
            orma_schema,
            aliases_by_table,
            path,
            statement
        })
    }

    // escaped value
    if ('escape' in statement) {
        return validate(
            {
                type: 'object',
                properties: {
                    escape: {
                        anyOf: [
                            { type: 'number' },
                            { type: 'string' },
                            { type: 'null' },
                            {
                                type: 'array',
                                items: [
                                    { type: 'number' },
                                    { type: 'string' },
                                    { type: 'null' }
                                ]
                            }
                        ]
                    }
                },
                required: ['escape']
            },
            path,
            statement
        )
    }

    if ('from' in statement) {
        return validate_select({
            orma_schema,
            path,
            aliases_by_table,
            require_one_select: true,
            statement
        })
    }

    // sql function
    const expression_function_errors = validate_expression_function({
        orma_schema,
        aliases_by_table,
        path,
        table_name,
        statement
    })

    // undefined means the expression is not a valid expression function
    if (!expression_function_errors) {
        return [
            {
                message: `${format_value(
                    statement
                )} is not a recognized expression. Expressions should be one of: column name, table and column object, escaped value, subquery or SQL function.`,
                path
            }
        ] as OrmaError[]
    } else {
        return expression_function_errors
    }
}

const validate_column = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
>(
    table_name: string,
    column_name: string,
    {
        orma_schema,
        aliases_by_table,
        path
    }: QueryValidatorArgs<Schema, Expression<Schema, Aliases, Table>>
) => {
    const is_column = get_is_column_name(orma_schema, table_name, column_name)
    const column_aliases = aliases_by_table[table_name]
    const is_alias = column_aliases.includes(column_name)
    const is_valid = is_column || is_alias
    return !is_valid
        ? [
              {
                  error_code: 'validation_error',
                  message: `"${column_name}" is not a valid column or column alias of table "${table_name}".`,
                  path,
                  additional_info: {
                      table_name,
                      valid_columns: get_column_names(orma_schema, table_name),
                      valid_column_aliases: column_aliases
                  }
              } as OrmaError
          ]
        : []
}

export type Expression<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> =
    | ExpressionFunction<Schema, Aliases, Table>
    | GetColumns<Schema, Table>
    | GetAliases<Schema, Aliases, Table>
    | NamedColumn<Schema, Aliases, GetAllTables<Schema>>
    | { readonly escape: number | string | null | (number | string | null)[] }
    | Select<Schema, Aliases>
// TODO: add type subquery here

type NamedColumn<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Tables extends GetAllTables<Schema>
> = Tables extends GetAllTables<Schema>
    ? {
          readonly table: Tables
          readonly column:
              | GetColumns<Schema, Tables>
              | GetAliases<Schema, Aliases, Tables>
      }
    : never
