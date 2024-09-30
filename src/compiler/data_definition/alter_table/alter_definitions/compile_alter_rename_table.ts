import { escape_column } from '../../../../helpers/escape'
import { validate } from '../../../common/validator'
import { CompilerArgs } from '../../../compiler'

export const compile_alter_rename_table = ({
    statement,
    path,
    database_type
}: CompilerArgs<AlterRenameTable>) => {
    const new_name = escape_column(statement.new_name, database_type)
    return `RENAME TO ${new_name}`
}

export const validate_alter_rename_table = ({
    statement,
    path,
    database_type
}: CompilerArgs<AlterRenameTable>) => {
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
