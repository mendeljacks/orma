import { OrmaError } from '../../helpers/error_handling'
import { get_is_column_name, get_is_table_name } from '../../helpers/schema_helpers'
import {
    GetAllTables,
    GetColumnsNotRequiredForCreate,
    GetColumnsRequiredForCreate,
    GetColumnType
} from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { OrmaQueryAliases } from '../../types/query/query_types'
import { format_value } from '../common/message_formatting'
import { validate, ValidationSchema } from '../common/validator'
import { QueryValidatorArgs } from '../compiler'
import { sql_to_typescript_types } from '../data_definition/sql_data_types'

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

export const validate_insert_into = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
>({
    orma_schema,
    statement,
    path,
    aliases_by_table
}: QueryValidatorArgs<Schema, InsertInto<Schema>>): OrmaError[] => {
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

    const row_errors = statement.rows.flatMap(row => ({
        // TODO: check for required fields

        const field_errors = Object.entries(row).map(([field, value]) => {

        })
    }))
}

const validate_insert_into_field = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
>({
    orma_schema,
    statement,
    path,
    aliases_by_table,
    table_name, column_name
}: QueryValidatorArgs<Schema, InsertInto<Schema>> & {table_name: GetAllTables<Schema>, column_name: string}): OrmaError[] => {
    if (!get_is_column_name(orma_schema, table_name, column)) {
        return [
            {
                error_code: 'validation_error',
                message: `${format_value(
                    table_name
                )} is not a valid table name.`,
                path: [...path]
            }
        ]
    }

    const column_schema = get_column_json_schema(orma_schema, table_name, column_name)
    const column_errors = validate(column_schema, [...path, column_name], statement)


}

const get_column_json_schema = (
    orma_schema: OrmaSchema,
    table_name: string,
    column_name: string,
): ValidationSchema => {
    const field_schema = orma_schema.tables[table_name].columns[column_name]
    const is_nullable = !field_schema.not_null
    const base_schema = get_field_base_json_schema(
        orma_schema,
        table_name,
        column_name,
    )
    const schemas: ValidationSchema[] = [
        base_schema,
        ...(is_nullable ? [{ const: null }] : []),
        {
            type: 'object',
            properties: {
                guid: {
                    anyOf: [{ type: 'string' }, { type: 'number' }]
                }
            }
        }
    ]
    return {
        anyOf: schemas
    }
}

const get_field_base_json_schema = (
    orma_schema: OrmaSchema,
    table_name: string,
    column_name: string,
): ValidationSchema => {
    const field_schema = orma_schema.tables[table_name].columns[column_name]
    const ts_type = sql_to_typescript_types[field_schema.data_type]
    if (ts_type === 'boolean') {
        return { type: 'boolean' }
    }
    if (ts_type === 'enum') {
        return {
                enum: new Set(field_schema.enum_values)
            }
        
    }
    if (ts_type === 'number') {
        return { type: 'number' }
    }
    if (ts_type === 'string') {
        return { type: 'string' }
    }

    // unsupported
    return { enum: new Set()}
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
        >]: GetColumnType<Schema, Table, Column>
    } & {
        readonly [Column in GetColumnsNotRequiredForCreate<
            Schema,
            Table
        >]?: GetColumnType<Schema, Table, Column>
    })[]
}

// TODO: make sure all errors have an error code
// TODO: make sure base errors are always returned right away if there are any to prevent cannot read
// property of undefined errors when checking for more errors
// TODO: add casting (e.g. string to number, 1 / 0 -> true / false, etc.)