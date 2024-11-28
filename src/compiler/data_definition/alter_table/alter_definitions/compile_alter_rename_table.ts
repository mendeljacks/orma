import { escape_identifier } from '../../../../helpers/escape'
import { validate } from '../../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../../compiler'

export const compile_alter_rename_table = ({
    statement,
    database_type
}: DDLCompilerArgs<AlterRenameTable>) => {
    const new_name = escape_identifier(database_type, statement.new_name)
    return `RENAME TO ${new_name}`
}

export const validate_alter_rename_table = ({
    statement,
    path
}: DDLValidatorArgs<AlterRenameTable>) => {
    const errors = validate(
        {
            type: 'object',
            properties: {
                alter_operation: {
                    enum: new Set(['rename_table'])
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

export type AlterRenameTable = {
    readonly alter_operation: 'rename_table'
    readonly new_name: string
}
