import { OrmaError } from '../../helpers/error_handling'
import { escape_value } from '../../helpers/escape'
import { get_is_table_name } from '../../helpers/schema_helpers'
import { GetAllTables } from '../../schema/schema_helper_types'
import { OrmaSchema, SupportedDatabases } from '../../schema/schema_types'
import { OrmaQueryAliases } from '../../types/query/query_types'
import { format_value } from '../common/message_formatting'
import { validate } from '../common/validator'
import { MutationValidatorArgs } from '../compiler'
import {
    compile_order_by,
    order_by_json_schema,
    OrderBy,
    validate_order_by
} from '../query/compile_select'
import { compile_where, validate_where, Where } from '../query/compile_where'

export const compile_delete_from = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
>({
    orma_schema,
    statement
}: {
    orma_schema: OrmaSchema
    statement: DeleteFrom<Schema>
}) => {
    const database_type =
        orma_schema.tables[statement.delete_from].database_type

    const where_string = compile_where({
        orma_schema,
        statement: statement.where,
        table_name: statement.delete_from
    })

    const order_by_string = statement.order_by
        ? ` ${compile_order_by({
              orma_schema,
              statement: statement.order_by,
              table_name: statement.delete_from
          })}`
        : ''

    const limit_string = statement.limit
        ? ` ${escape_value(database_type, statement.limit)}`
        : ''

    return `DELETE FROM ${statement.delete_from} WHERE ${where_string}${order_by_string}${limit_string}`
}

export const validate_delete = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
>({
    orma_schema,
    statement,
    path
}: MutationValidatorArgs<Schema, DeleteFrom<Schema>>): OrmaError[] => {
    const base_errors = validate(
        {
            type: 'object',
            properties: {
                delete_from: { type: 'string' },
                where: { type: 'object' },
                order_by: order_by_json_schema,
                limit: { type: 'integer', minimum: 0 }
            },
            required: ['delete_from', 'where']
        },
        path,
        statement
    )

    if (base_errors.length) {
        return base_errors
    }

    const table_errors: OrmaError[] = get_is_table_name(
        orma_schema,
        statement.delete_from
    )
        ? [
              {
                  error_code: 'validation_error',
                  message: `${format_value(
                      statement.delete_from
                  )} is not a valid table name.`,
                  path: [...path, 'delete_from']
              }
          ]
        : []

    if (table_errors.length > 0) {
        return table_errors
    }

    const where_errors = validate_where({
        orma_schema,
        statement: statement.where,
        path: [...path, 'where'],
        aliases_by_table: {},
        table_name: statement.delete_from
    })

    const order_by_errors = statement.order_by
        ? validate_order_by({
              orma_schema,
              aliases_by_table: {},
              path,
              statement: statement.order_by,
              table_name: statement.delete_from
          })
        : []

    return [...where_errors, ...order_by_errors]
}

export type DeleteFrom<Schema extends OrmaSchema> = DeleteFromForTables<
    Schema,
    GetAllTables<Schema>
>

type DeleteFromForTables<
    Schema extends OrmaSchema,
    Tables extends GetAllTables<Schema>
> = Tables extends GetAllTables<Schema>
    ? DeleteFromForTable<Schema, Tables>
    : never

type DeleteFromForTable<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = {
    readonly delete_from: Table
    readonly where: Where<Schema, {}, Table>
    readonly order_by?: OrderBy<Schema, {}, Table>
    readonly limit?: number
}
