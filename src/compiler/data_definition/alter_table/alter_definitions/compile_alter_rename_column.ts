import { escape_identifier } from '../../../../helpers/escape'
import { validate } from '../../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../../compiler'

export const compile_alter_rename_column = ({
    statement,
    database_type
}: DDLCompilerArgs<AlterRenameColumn>) => {
    const name = escape_identifier(database_type, statement.name)
    const new_name = escape_identifier(database_type, statement.new_name)
    return `RENAME COLUMN ${name} TO ${new_name}`
}

export const validate_alter_rename_column = ({
    statement,
    path
}: DDLValidatorArgs<AlterRenameColumn>) => {
    const errors = validate(
        {
            type: 'object',
            properties: {
                alter_operation: {
                    enum: new Set(['rename_column'])
                },
                name: {
                    type: 'string',
                    minLength: 1
                },
                new_name: {
                    type: 'string',
                    minLength: 1
                }
            }
        },
        path,
        statement
    )

    return errors
}

export type AlterRenameColumn = {
    readonly alter_operation: 'rename_column'
    readonly name: string
    readonly new_name: string
}
