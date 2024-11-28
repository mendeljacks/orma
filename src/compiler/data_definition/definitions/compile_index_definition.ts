import { validate } from '../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../compiler'

export const compile_index_definition = ({
    statement
}: DDLCompilerArgs<IndexDefinition>) => {
    const name_string = statement.name ? ` ${statement.name}` : ''
    const type_string =
        statement.index === 'full_text'
            ? 'FULLTEXT '
            : statement.index === 'spatial'
            ? 'SPATIAL '
            : ''
    const invisible_string = statement.invisible ? ' INVISIBLE' : ''
    const comment_string = statement.comment
        ? ` COMMENT "${statement.comment}"`
        : ''

    return `${type_string}INDEX${name_string} (${statement.columns.join(
        ', '
    )})${invisible_string}${comment_string}`
}

export const validate_index_definition = ({
    statement,
    path
}: DDLValidatorArgs<IndexDefinition>) => {
    const errors = validate(
        {
            type: 'object',
            properties: {
                index: { enum: new Set([true, 'full_text', 'spatial']) },
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
            required: ['index', 'columns']
        },
        path,
        statement
    )

    return errors
}

export type IndexDefinition = {
    index: true | 'full_text' | 'spatial'
    columns: readonly string[]
    name?: string
    comment?: string
    invisible?: boolean
}
