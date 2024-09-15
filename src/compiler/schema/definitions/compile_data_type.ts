import { validate } from '../../common/validator'
import { CompilerArgs } from '../../compiler'
import { mysql_types } from '../sql_data_types'
import { ColumnDefinition } from './compile_column_definition'

export const compile_data_type = ({
    statement,
    database_type
}: CompilerArgs<ColumnDefinition>) => {
    if (statement.data_type === 'enum') {
        const enum_values = statement.enum_values?.map(el =>
            database_type === 'postgres' ? `'${el}'` : `"${el}"`
        )
        // postgres and sqlite dont support enum types, so we handle it elsewhere via check constraint
        return database_type === 'mysql' ? `ENUM(${enum_values})` : `TEXT`
    }

    if (statement.data_type === 'int' && database_type === 'postgres') {
        return 'INT'
    }

    // sqlite actually allows INT as a type, but primary key auto incrementing
    // only activates if you use the exact type of INTEGER
    if (statement.data_type === 'int' && database_type === 'sqlite') {
        return `INTEGER`
    }

    const data_type_args = [statement.precision, statement.scale].filter(
        el => el !== undefined
    )
    const data_type_args_string = data_type_args.length
        ? `(${data_type_args.join(', ')})`
        : ''

    const data_type_string = statement.data_type.toUpperCase()
    const unsigned_string =
        statement.unsigned && database_type !== 'postgres' ? `UNSIGNED ` : ''

    return `${unsigned_string}${data_type_string}${data_type_args_string}`
}

export const validate_data_type = ({
    statement,
    path
}: CompilerArgs<ColumnDefinition>) => {
    const enum_errors =
        statement.data_type === 'enum'
            ? validate(
                  {
                      type: 'object',
                      properties: {
                          enum_values: {
                              type: 'array',
                              minItems: 1,
                              items: {
                                  type: 'string',
                                  minLength: 1
                              }
                          }
                      },
                      required: ['enum_values']
                  },
                  path,
                  statement
              )
            : []

    const errors = validate(
        {
            type: 'object',
            properties: {
                data_type: {
                    enum: mysql_types
                },
                scale: {
                    type: 'integer',
                    minimum: 0
                },
                precision: {
                    type: 'integer',
                    minimum: 0
                },
                unsigned: {
                    type: 'boolean'
                }
            },
            required: ['data_type']
        },
        path,
        statement
    )

    return [...errors, ...enum_errors]
}
