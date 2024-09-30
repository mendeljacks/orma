import { escape_column } from '../../../helpers/escape'
import { validate } from '../../common/validator'
import { CompilerArgs } from '../../compiler'

export const compile_truncate_table = ({
    statement,
    path,
    database_type
}: CompilerArgs<TruncateTable>) => {
    const name = escape_column(statement.truncate_table, database_type)

    return `TRUNCATE TABLE ${name}`
}

export const validate_alter_truncate = ({
    statement,
    path,
    database_type
}: CompilerArgs<TruncateTable>) => {
    return validate(
        {
            type: 'object',
            properties: {
                truncate_table: { type: 'string', minLength: 1 }
            },
            required: ['truncate_table']
        },
        path,
        statement
    )
}

export type TruncateTable = {
    truncate_table: string
}
