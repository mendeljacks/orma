import { escape_identifier } from '../../../helpers/escape'
import { validate } from '../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../compiler'

export const compile_truncate_table = ({
    statement,
    database_type
}: DDLCompilerArgs<TruncateTable>) => {
    const name = escape_identifier(database_type, statement.truncate_table)

    return `TRUNCATE TABLE ${name}`
}

export const validate_alter_truncate = ({
    statement,
    path
}: DDLValidatorArgs<TruncateTable>) => {
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
