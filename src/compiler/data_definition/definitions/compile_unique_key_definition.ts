import { validate } from '../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../compiler'

export const compile_unique_key_definition = ({
    statement
}: DDLCompilerArgs<UniqueKeyDefinition>) => {
    const name_string = statement.name ? ` ${statement.name}` : ''

    const invisible_string = statement.invisible ? ' INVISIBLE' : ''
    const comment_string = statement.comment
        ? ` COMMENT "${statement.comment}"`
        : ''

    return `CONSTRAINT${name_string} UNIQUE (${statement.columns.join(
        ', '
    )})${invisible_string}${comment_string}`
}

export const validate_unique_key_definition = ({
    statement,
    path
}: DDLValidatorArgs<UniqueKeyDefinition>) => {
    const errors = validate(
        {
            type: 'object',
            properties: {
                constraint: { enum: new Set(['unique_key']) },
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

export type UniqueKeyDefinition = {
    constraint: 'unique_key'
    columns: readonly string[]
    name?: string
    comment?: string
    invisible?: boolean
}
