import { validate } from '../../common/validator'
import { CompilerArgs } from '../../compiler'
import { sql_to_typescript_types } from '../sql_data_types'
import { compile_data_type } from './compile_data_type'

export const compile_index_definition = ({
    statement,
    path,
    database_type
}: CompilerArgs<IndexDefinition>) => {
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
    path,
    database_type
}: CompilerArgs<IndexDefinition>) => {
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
