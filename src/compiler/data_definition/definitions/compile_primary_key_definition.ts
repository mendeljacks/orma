import { escape_identifier } from '../../../helpers/escape'
import { validate } from '../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../compiler'

export const compile_primary_key_definition = ({
    statement,
    database_type
}: DDLCompilerArgs<PrimaryKeyDefintion>) => {
    const name_string = statement.name ? ` ${statement.name}` : ''

    const invisible_string = statement.invisible ? ' INVISIBLE' : ''
    const comment_string = statement.comment
        ? ` COMMENT "${statement.comment}"`
        : ''

    return `CONSTRAINT${name_string} PRIMARY KEY (${statement.columns
        .map(col => escape_identifier(database_type, col))
        .join(', ')})${invisible_string}${comment_string}`
}

export const validate_primary_key_definition = ({
    statement,
    path
}: DDLValidatorArgs<PrimaryKeyDefintion>) => {
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
