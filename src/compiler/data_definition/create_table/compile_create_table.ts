import path = require('path')
import { validate } from '../../common/validator'
import { CompilerArgs } from '../../compiler'
import {
    compile_definition,
    Definition,
    validate_definition
} from '../definitions/compile_definition'

export const compile_create_table = ({
    statement,
    path,
    database_type
}: CompilerArgs<CreateTable>) => {
    if ('like_table' in statement) {
        return `CREATE TABLE ${statement.create_table} LIKE ${statement.like_table}`
    } else {
        // regular create statement
        const temporary_string = statement.temporary ? ' TEMPORARY' : ''
        const if_not_exists_string = statement.if_not_exists
            ? ' IF NOT EXISTS'
            : ''

        // sqlite does not support comments
        const comment_string =
            statement.comment && database_type !== 'sqlite'
                ? ` COMMENT ${statement.comment}`
                : ''

        const definitions_strings = statement.definitions.map((definition, i) =>
            compile_definition({
                database_type,
                statement: definition,
                path: [...path, 'definitions', i]
            })
        )

        return `CREATE${temporary_string} TABLE ${
            statement.create_table
        }${if_not_exists_string} (${definitions_strings.join(
            ', '
        )}) ${comment_string}`
    }
}

export const validate_create_table = ({
    statement,
    path,
    database_type
}: CompilerArgs<CreateTable>) => {
    if ('like_table' in statement) {
        return validate(
            {
                type: 'object',
                properties: {
                    create_table: { type: 'string', minLength: 1 },
                    like_table: { type: 'string', minLength: 1 }
                },
                required: ['create_table', 'like_table']
            },
            path,
            statement
        )
    } else {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    create_table: { type: 'string', minLength: 1 },
                    temporary: { type: 'boolean' },
                    if_not_exists: { type: 'boolean' },
                    comment: { type: 'string' },
                    definitions: { type: 'array', minItems: 1 }
                }
            },
            path,
            statement
        )

        const definition_errors = statement.definitions.flatMap(
            (definition, i) =>
                validate_definition({
                    statement: definition,
                    path: [...path, 'definitions', i],
                    database_type
                })
        )

        return [...base_errors, ...definition_errors]
    }
}

export type CreateTable = RegularCreateTable | CreateTableLike

export type RegularCreateTable = {
    readonly create_table: string
    readonly temporary?: boolean
    readonly if_not_exists?: boolean
    readonly comment?: string
    readonly definitions: readonly Definition[]
}

export type CreateTableLike = {
    readonly create_table: string
    readonly like_table: string
}
