import { escape_column } from '../../../helpers/escape'
import { validate } from '../../common/validator'
import { CompilerArgs } from '../../compiler'
import { sql_to_typescript_types } from '../sql_data_types'
import { compile_data_type } from './compile_data_type'

export const compile_primary_key_definition = ({
    statement,
    path,
    database_type
}: CompilerArgs<PrimaryKeyDefintion>) => {
    const name_string = statement.name ? ` ${statement.name}` : ''

    const invisible_string = statement.invisible ? ' INVISIBLE' : ''
    const comment_string = statement.comment
        ? ` COMMENT "${statement.comment}"`
        : ''

    return `CONSTRAINT${name_string} PRIMARY KEY (${statement.columns
        .map(col => escape_column(col, database_type))
        .join(', ')})${invisible_string}${comment_string}`
}

export const validate_primary_key_definition = ({
    statement,
    path,
    database_type
}: CompilerArgs<PrimaryKeyDefintion>) => {
    const errors = validate(
        {
            type: 'object',
            properties: {
                constraint: { enum: new Set(['primary_key']) },
                columns: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 1
                },
                name: {
                    type: 'string'
                },
                comment: { type: 'string' },
                invisible: { type: 'boolean' }
            },
            required: ['constraint', 'columns']
        },
        path,
        statement
    )

    return errors
}

export type PrimaryKeyDefintion = {
    constraint: 'primary_key'
    columns: readonly string[]
    name?: string
    comment?: string
    invisible?: boolean
}
