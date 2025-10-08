import { OrmaError } from '../../helpers/error_handling'
import { escape_identifier } from '../../helpers/escape'
import { get_is_table_name } from '../../helpers/schema_helpers'
import {
    GetAllTables,
    GetColumns,
    GetColumnType
} from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { OrmaQueryAliases } from '../../types/query/query_types'
import { format_value } from '../common/message_formatting'
import { validate } from '../common/validator'
import { MutationValidatorArgs } from '../compiler'
import { compile_where, validate_where, Where } from '../query/compile_where'
import {
    compile_update_expression,
    validate_update_expression
} from './compile_update_expression'

export const compile_update = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
>({
    orma_schema,
    statement
}: {
    orma_schema: Schema
    statement: Update<Schema>
}) => {
    const database_type = orma_schema.tables[statement.update].database_type

    const where_string = compile_where({
        orma_schema,
        statement: statement.where,
        table_name: statement.update
    })

    const set_strings = Object.keys(statement.set)
        .map(key => {
            const value = statement.set[key as keyof typeof statement.set]
            if (value === undefined) {
                return undefined
            }

            return `${escape_identifier(
                database_type,
                key
            )} = ${compile_update_expression({
                orma_schema,
                table_name: statement.update,
                statement: value
            })}`
        })
        .filter(el => el !== undefined)

    return `UPDATE ${statement.where} SET ${set_strings.join(
        ', '
    )} WHERE ${where_string}`
}

export const validate_update = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
>({
    orma_schema,
    statement,
    path
}: MutationValidatorArgs<Schema, Update<Schema>>): OrmaError[] => {
    const base_errors = validate(
        {
            type: 'object',
            properties: {
                update: { type: 'string' },
                set: { type: 'object' },
                where: { type: 'object' }
            },
            required: ['update', 'set', 'where']
        },
        path,
        statement
    )

    if (base_errors.length) {
        return base_errors
    }

    const table_errors: OrmaError[] = get_is_table_name(
        orma_schema,
        statement.update
    )
        ? [
              {
                  error_code: 'validation_error',
                  message: `${format_value(
                      statement.update
                  )} is not a valid table name.`,
                  path: [...path, 'insert_into']
              }
          ]
        : []

    if (table_errors.length > 0) {
        return table_errors
    }

    const set_columns = Object.keys(statement.set)
    const required_column_errors: OrmaError[] =
        set_columns.filter(key => statement.set[key] !== undefined).length === 0
            ? [
                  {
                      error_code: 'validation_error',
                      message: `Update column set is empty.`,
                      path: [...path, 'set']
                  }
              ]
            : []

    const field_type_errors = Object.keys(statement.set).flatMap(
        column_name => {
            const value =
                statement.set[column_name as keyof typeof statement.set]
            // undefined is always allowed for an update set since nothing is required
            if (value === undefined) {
                return []
            }
            return validate_update_expression({
                orma_schema,
                statement: value,
                path: [...path, 'set', column_name],
                column_name,
                table_name: statement.update
            })
        }
    )

    const where_errors = validate_where({
        orma_schema,
        statement: statement.where,
        path: [...path, 'where'],
        aliases_by_table: {},
        table_name: statement.update
    })

    return [...required_column_errors, ...field_type_errors, ...where_errors]
}

export type Update<Schema extends OrmaSchema> = UpdateForTables<
    Schema,
    GetAllTables<Schema>
>

type UpdateForTables<
    Schema extends OrmaSchema,
    Tables extends GetAllTables<Schema>
> = Tables extends GetAllTables<Schema>
    ? UpdateForTable<Schema, Tables>
    : never

type UpdateForTable<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = {
    readonly update: Table
    readonly set: {
        readonly [Column in GetColumns<Schema, Table>]?: GetColumnType<
            Schema,
            Table,
            Column
        >
    }
    readonly where: Where<Schema, {}, Table>
}
