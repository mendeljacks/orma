import { is_simple_object } from '../../helpers/helpers'
import { is_column_name, is_table_name } from '../../helpers/schema_helpers'
import { sql_function_definitions } from '../../query/ast_to_sql'
import { Path } from '../../types'
import { GetAliases, OrmaQueryAliases } from '../../types/query/query_types'
import { GetAllTables, GetColumns } from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { make_validation_error } from './compiler_helpers'

export const compile_expression = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    aliases_by_table,
    tables_in_scope,
    aggregate_mode,
    path,
    table_name,
    expression
}: {
    orma_schema: OrmaSchema
    aliases_by_table: { [table in GetAllTables<Schema>]: string[] }[]
    tables_in_scope: string[]
    aggregate_mode: 'no_aggregates' | 'allow_aggregates'
    path: Path
    table_name: Table
    expression: Expression<Schema, Aliases, Table>
}) => {
    // column name
    if (typeof expression === 'string') {
        const errors = !is_column_name(orma_schema, table_name, expression)
            ? [
                  make_validation_error(
                      path,
                      `"${expression}" is not a column of table ${table_name}.`
                  )
              ]
            : []

        return { sql: expression, errors }
    }

    if (is_simple_object(expression)) {
        const keys = Object.keys(expression)
        if ('column' in expression) {
            const is_table = is_table_name(orma_schema, expression.table)
            const table_errors = !is_table
                ? [
                      make_validation_error(
                          path,
                          `"${expression.table}" is not a table name.`
                      )
                  ]
                : !tables_in_scope.includes(table_name)
                ? [
                      make_validation_error(
                          path,
                          `"${expression.table}" is not an in-scope table name.`
                      )
                  ]
                : []

            const column_errors =
                is_table &&
                !is_column_name(
                    orma_schema,
                    expression.table,
                    expression.column
                )
            //&& !aliases_by_table[expression.table]?.
        }
    }
}

const get_table_column_object_errors = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    aliases_by_table,
    tables_in_scope,
    path,
    table_name,
    expression
}: {
    orma_schema: OrmaSchema
    aliases_by_table: { [table in GetAllTables<Schema>]: string[] }[]
    tables_in_scope: Set<string>
    path: Path
    table_name: Table
    expression: NamedColumn<Schema, Aliases, GetAllTables<Schema>>
}) => {}

type E = Expression<OrmaSchema, {}, ''>

export type Expression<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> =
    | ExpressionFunction<
          Schema,
          Aliases,
          Table,
          keyof typeof sql_function_definitions
      >
    | GetColumns<Schema, Table>
    | GetAliases<Schema, Aliases, Table>
    | NamedColumn<Schema, Aliases, GetAllTables<Schema>>

type ExpressionFunction<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>,
    FunctionNames extends string
> = FunctionNames extends string
    ? {
          [Key in FunctionNames]: Expression<Schema, Aliases, Table>
      }
    : never

type NamedColumn<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Tables extends GetAllTables<Schema>
> = Tables extends GetAllTables<Schema>
    ? {
          table: Tables
          column:
              | GetColumns<Schema, Tables>
              | GetAliases<Schema, Aliases, Tables>
      }
    : never
