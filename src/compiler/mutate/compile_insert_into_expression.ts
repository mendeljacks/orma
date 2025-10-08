import { OrmaError } from '../../helpers/error_handling'
import { escape_identifier, escape_value } from '../../helpers/escape'
import {
    GetAllTables,
    GetColumns,
    GetColumnType
} from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { format_value } from '../common/message_formatting'
import { MutationValidatorArgs, QueryCompilerArgs } from '../compiler'
import {
    NamedColumn,
    validate_named_column
} from '../expression/compile_expression'
import {
    compile_expression_function,
    ExpressionFunction,
    validate_expression_function
} from '../expression/compile_expression_function'
import { validate_mutation_value } from './mutation_expression'

// TODO: make sure subqueries get brackets around them like id IN (SELECT ...)
export const compile_insert_into_expression = <
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    table_name,
    statement
}: QueryCompilerArgs<
    Schema,
    Table,
    InsertIntoExpression<Schema, Table, GetColumns<Schema, Table>>
>): string => {
    const database_type = orma_schema.tables[table_name].database_type

    // for mutations primitive values are considered escaped instead of column names to keep the json object
    // smaller in large mutations since it means you dont need to put escape objects on every value
    if (typeof statement !== 'object' || statement === null) {
        return escape_value(database_type, statement)
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

    if ('default' in statement) {
        return 'DEFAULT'
    }

    // sql function
    return `${compile_expression_function({
        orma_schema,
        table_name,
        statement
    })}`
}

export const validate_insert_into_expression = <
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    table_name,
    column_name,
    path,
    statement
}: MutationValidatorArgs<
    Schema,
    InsertIntoExpression<Schema, Table, GetColumns<Schema, Table>>
> & {
    table_name: Table
    column_name: string
}): OrmaError[] => {
    const database_type = orma_schema.tables[table_name].database_type

    if (typeof statement !== 'object' || statement === null) {
        return validate_mutation_value({
            orma_schema,
            path,
            table_name,
            column_name,
            statement
        })
    }

    // table + column name
    if ('table' in statement) {
        return validate_named_column({
            orma_schema,
            path,
            aliases_by_table: {},
            table_name,
            statement
        })
    }

    // escaped value
    if ('escape' in statement) {
        return validate_mutation_value({
            orma_schema,
            path: [...path, 'escape'],
            table_name,
            column_name,
            statement: statement.escape
        })
    }

    if ('default' in statement) {
        if (database_type === 'sqlite') {
            return [
                {
                    error_code: 'unsupported_feature',
                    message: `Insert into default is not supported by SQLite.`,
                    path: [...path, 'default']
                }
            ]
        }

        return statement.default !== true
            ? [
                  {
                      error_code: 'validation_error',
                      message: `Insert default must be set to true.`,
                      path: [...path, 'default']
                  }
              ]
            : []
    }

    // sql function
    const expression_function_errors = validate_expression_function({
        orma_schema,
        aliases_by_table: {},
        path,
        table_name,
        statement
    })

    // undefined means the expression is not a valid expression function
    if (!expression_function_errors) {
        return [
            {
                error_code: 'validation_error',
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

export type InsertIntoExpression<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Column extends GetColumns<Schema, Table>
> =
    | GetColumnType<Schema, Table, Column>
    | {
          readonly escape: GetColumnType<Schema, Table, Column>
      }
    | ExpressionFunction<Schema, {}, Table>
    | NamedColumn<Schema, {}, GetAllTables<Schema>>
    | { readonly default: true }
