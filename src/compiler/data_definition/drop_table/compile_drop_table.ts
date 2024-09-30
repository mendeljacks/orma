import { escape_column } from '../../../helpers/escape'
import { validate } from '../../common/validator'
import { CompilerArgs } from '../../compiler'

export const compile_drop_table = ({
    statement,
    path,
    database_type
}: CompilerArgs<DropTable>) => {
    const name = escape_column(statement.drop_table, database_type)
    const if_exists_string = statement.if_exists ? ' IF EXISTS' : ''

    return `DROP TABLE${if_exists_string} ${name}`
}

export const validate_alter_drop = ({
    statement,
    path,
    database_type
}: CompilerArgs<DropTable>) => {
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
