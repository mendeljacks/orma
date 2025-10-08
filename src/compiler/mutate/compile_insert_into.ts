import { OrmaError } from '../../helpers/error_handling'
import {
    get_column_names,
    get_column_schema,
    get_is_table_name
} from '../../helpers/schema_helpers'
import {
    GetAllTables,
    GetColumns,
    GetColumnsNotRequiredForCreate,
    GetColumnsRequiredForCreate
} from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { OrmaQueryAliases } from '../../types/query/query_types'
import {
    format_list_of_values,
    format_value
} from '../common/message_formatting'
import { validate } from '../common/validator'
import { MutationValidatorArgs } from '../compiler'
import {
    compile_insert_into_expression,
    InsertIntoExpression,
    validate_insert_into_expression
} from './compile_insert_into_expression'

export const compile_insert_into = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
>({
    orma_schema,
    statement
}: {
    orma_schema: Schema
    statement: InsertInto<Schema>
}) => {
    // to generate the insert into strings:
    // 1. find unique list of columns for all rows. This is important because the values array must all have
    //    the same number of items and the columns must appear in the same order
    // 2. generate the values array using the columns array to ensure they are all uniform

    // step 1
    let columns_set = new Set<string>()
    for (const row of statement.rows) {
        for (const key of Object.keys(row)) {
            columns_set.add(key)
        }
    }
    const columns = [...columns_set]

    // step 2
    const values = statement.rows.map(row => {
        let row_values = new Array(columns.length)
        for (let i = 0; i < columns.length; i++) {
            const column_schema = get_column_schema(
                orma_schema,
                statement.insert_into,
                columns[i]
            )
            const row_value =
                row[columns[i] as keyof typeof row] ??
                column_schema.default ??
                null
            // Values can be primitives but also expressions and can rely on values of columns defined earlier
            row_values[i] = compile_insert_into_expression({
                orma_schema,
                statement: row_value as InsertIntoExpression<
                    Schema,
                    typeof statement.insert_into,
                    GetColumns<Schema, typeof statement.insert_into>
                >,
                table_name: statement.insert_into
            })
        }
        return row_values
    })

    const columns_str = columns.join(', ')
    const values_str = values.map(value => `(${value.join(', ')})`).join(', ')

    return `INSERT INTO ${statement.insert_into} (${columns_str}) VALUES ${values_str}`
}

export const validate_insert_into = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
>({
    orma_schema,
    statement,
    path
}: MutationValidatorArgs<Schema, InsertInto<Schema>>): OrmaError[] => {
    const base_errors = validate(
        {
            type: 'object',
            properties: {
                insert_into: { type: 'string' },
                rows: { type: 'array', items: { type: 'object' }, minItems: 1 }
            },
            required: ['insert_into', 'rows']
        },
        path,
        statement
    )

    if (base_errors.length) {
        return base_errors
    }

    const table_errors: OrmaError[] = get_is_table_name(
        orma_schema,
        statement.insert_into
    )
        ? [
              {
                  error_code: 'validation_error',
                  message: `${format_value(
                      statement.insert_into
                  )} is not a valid table name.`,
                  path: [...path, 'insert_into']
              }
          ]
        : []

    const row_errors = statement.rows.flatMap((row, row_index) => {
        const required_columns = get_column_names(
            orma_schema,
            statement.insert_into
        ).filter(column =>
            is_required_column(orma_schema, statement.insert_into, column)
        )
        const missing_columns = required_columns.filter(
            column => row[column as keyof typeof row] === undefined
        )
        const missing_column_errors: OrmaError[] = missing_columns.length
            ? [
                  {
                      error_code: 'validation_error',
                      message: `These columns must be provided to create ${format_value(
                          statement.insert_into
                      )}: ${format_list_of_values(missing_columns)}`,
                      path: [...path, 'rows', row_index]
                  }
              ]
            : []

        const field_type_errors = Object.keys(row).flatMap(column_name => {
            const value = row[column_name as keyof typeof row]

            // undefined should be treated like the value is not there for consistency. Required columns being set
            // to undefined would have already generated an error above so no need to check again
            if (value === undefined) {
                return []
            }

            return validate_insert_into_expression({
                orma_schema,
                statement: value,
                path: [...path, 'rows', row_index, column_name],
                column_name,
                table_name: statement.insert_into
            })
        })
        return [...missing_column_errors, ...field_type_errors]
    })

    return [...table_errors, ...row_errors]
}

const is_required_column = (
    orma_schema: OrmaSchema,
    table_name: string,
    column_name: string
) => {
    const column_schema = get_column_schema(
        orma_schema,
        table_name,
        column_name
    )
    const is_required =
        !!column_schema?.not_null &&
        column_schema?.default === undefined &&
        !column_schema?.auto_increment
    return is_required
}

export type InsertInto<Schema extends OrmaSchema> = InsertIntoForTables<
    Schema,
    GetAllTables<Schema>
>

type InsertIntoForTables<
    Schema extends OrmaSchema,
    Tables extends GetAllTables<Schema>
> = Tables extends GetAllTables<Schema>
    ? InsertIntoForTable<Schema, Tables>
    : never

type InsertIntoForTable<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = {
    readonly insert_into: Table
    readonly rows: ({
        readonly [Column in GetColumnsRequiredForCreate<
            Schema,
            Table
        >]: InsertIntoExpression<Schema, Table, Column>
    } & {
        readonly [Column in GetColumnsNotRequiredForCreate<
            Schema,
            Table
        >]?: InsertIntoExpression<Schema, Table, Column>
    })[]
}
