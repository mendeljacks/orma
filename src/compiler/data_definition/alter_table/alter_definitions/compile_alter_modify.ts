import { OrmaError } from '../../../../helpers/error_handling'
import { escape_identifier } from '../../../../helpers/escape'
import { validate } from '../../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../../compiler'
import {
    ColumnDefinition,
    compile_column_definition,
    validate_column_definition
} from '../../definitions/compile_column_definition'
import { compile_data_type } from '../../definitions/compile_data_type'

export const compile_alter_modify = ({
    statement,
    database_type
}: DDLCompilerArgs<AlterModify>) => {
    const column_name = escape_identifier(database_type, statement.name)
    // postgres thought it was a good idea to ignore the sql standard MODIFY and instead break it up into
    // many custom syntaxes, which is why we need this
    if (database_type === 'postgres') {
        let sqls: string[] = []
        if (statement.data_type) {
            const data_type = compile_data_type({
                statement,
                database_type
            })
            sqls.push(`ALTER COLUMN ${column_name} TYPE ${data_type}`)
        }
        if (statement.default) {
            sqls.push(
                `ALTER COLUMN ${column_name} SET DEFAULT ${statement.default}`
            )
        } else {
            sqls.push(`ALTER COLUMN ${column_name} DROP DEFAULT`)
        }

        if (statement.not_null) {
            sqls.push(`ALTER COLUMN SET NOT NULL`)
        } else {
            sqls.push(`ALTER COLUMN DROP NOT NULL`)
        }
    } else if (database_type === 'mysql') {
        return `MODIFY COLUMN ${compile_column_definition({
            statement,
            database_type
        })}`
    }

    // sqlite does not support modify statements
    return ''
}

export const validate_alter_modify = ({
    statement,
    path,
    database_type
}: DDLValidatorArgs<AlterModify>) => {
    // sqlite not supported
    if (database_type === 'sqlite') {
        const errors: OrmaError[] = [
            { message: 'The modify operation is not supported by SQLite.' }
        ]
        return errors
    }

    const alter_modify_errors = validate(
        {
            type: 'object',
            properties: { alter_operation: { enum: new Set(['modify']) } },
            required: ['alter_operation']
        },
        path,
        statement
    )
    const definition_errors = validate_column_definition({
        statement,
        path,
        database_type
    })

    return [...alter_modify_errors, ...definition_errors]
}

export type AlterModify =
    | ColumnDefinition & {
          readonly alter_operation: 'modify'
      }
