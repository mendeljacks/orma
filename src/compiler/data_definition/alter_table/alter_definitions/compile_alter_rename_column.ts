import { escape_column } from '../../../../helpers/escape'
import { validate } from '../../../common/validator'
import { CompilerArgs } from '../../../compiler'

export const compile_alter_rename_column = ({
    statement,
    path,
    database_type
}: CompilerArgs<AlterRenameColumn>) => {
    const name = escape_column(statement.name, database_type)
    const new_name = escape_column(statement.new_name, database_type)
    return `RENAME COLUMN ${name} TO ${new_name}`
}

export const validate_alter_rename_column = ({
    statement,
    path,
    database_type
}: CompilerArgs<AlterRenameColumn>) => {
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
