import { OrmaError } from '../../helpers/error_handling'
import {
    get_column_schema,
    get_is_column_name
} from '../../helpers/schema_helpers'
import {
    GetAllTables,
    GetColumns,
    GetColumnType
} from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { format_value } from '../common/message_formatting'
import { validate, ValidationSchema } from '../common/validator'
import { MutationValidatorArgs } from '../compiler'
import { sql_to_typescript_types } from '../data_definition/sql_data_types'

export const validate_mutation_value = <
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Column extends GetColumns<Schema, Table>
>({
    orma_schema,
    statement,
    path,
    table_name,
    column_name
}: MutationValidatorArgs<Schema, GetColumnType<Schema, Table, Column>> & {
    table_name: GetAllTables<Schema>
    column_name: string
}): OrmaError[] => {
    if (!get_is_column_name(orma_schema, table_name, column_name)) {
        return [
            {
                error_code: 'validation_error',
                message: `${format_value(
                    column_name
                )} is not a column of ${format_value(table_name)}.`,
                path
            }
        ]
    }

    const column_schema = get_column_json_schema(
        orma_schema,
        table_name,
        column_name
    )

    const column_errors = validate(column_schema, path, statement)
    return column_errors
}

const get_column_json_schema = (
    orma_schema: OrmaSchema,
    table_name: string,
    column_name: string
): ValidationSchema => {
    const column_schema = get_column_schema(
        orma_schema,
        table_name,
        column_name
    )
    const is_nullable = !column_schema.not_null
    const base_schema = get_field_base_json_schema(
        orma_schema,
        table_name,
        column_name
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
    column_name: string
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
    return { enum: new Set() }
}
