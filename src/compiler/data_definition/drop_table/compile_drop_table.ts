import { escape_identifier } from '../../../helpers/escape'
import { validate } from '../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../compiler'

export const compile_drop_table = ({
    statement,
    database_type
}: DDLCompilerArgs<DropTable>) => {
    const name = escape_identifier(database_type, statement.drop_table)
    const if_exists_string = statement.if_exists ? ' IF EXISTS' : ''

    return `DROP TABLE${if_exists_string} ${name}`
}

export const validate_alter_drop = ({
    statement,
    path
}: DDLValidatorArgs<DropTable>) => {
    return validate(
        {
            type: 'object',
            properties: {
                drop_table: { type: 'string', minLength: 1 },
                if_exists: { type: 'boolean' }
            },
            required: ['drop_table']
        },
        path,
        statement
    )
}

export type DropTable = {
    drop_table: string
    if_exists?: boolean
}
