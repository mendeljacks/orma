import path = require('path')

import { escape_column } from '../../../helpers/escape'
import { validate } from '../../common/validator'
import { CompilerArgs } from '../../compiler'
import {
    AlterAdd,
    compile_alter_add,
    validate_alter_add
} from './alter_definitions/compile_alter_add'
import {
    AlterDrop,
    compile_alter_drop,
    validate_alter_drop
} from './alter_definitions/compile_alter_drop'
import {
    AlterModify,
    compile_alter_modify,
    validate_alter_modify
} from './alter_definitions/compile_alter_modify'
import {
    AlterRenameColumn,
    compile_alter_rename_column,
    validate_alter_rename_column
} from './alter_definitions/compile_alter_rename_column'
import {
    AlterRenameTable,
    compile_alter_rename_table,
    validate_alter_rename_table
} from './alter_definitions/compile_alter_rename_table'

export const compile_alter_table = ({
    statement,
    path,
    database_type
}: CompilerArgs<AlterTable>) => {
    const table_string = escape_column(statement.alter_table, database_type)

    const alter_definitions_string = statement.definitions
        .map((definition, i) =>
            compile_alter_definition({
                statement: definition,
                database_type,
                path: [...path, 'definitions', i]
            })
        )
        .join(', ')

    return `ALTER TABLE ${table_string} ${alter_definitions_string}`
}

const compile_alter_definition = ({
    statement,
    path,
    database_type
}: CompilerArgs<AlterDefinition>) => {
    if (statement.alter_operation === 'add') {
        return compile_alter_add({ statement, path, database_type })
    }

    if (statement.alter_operation === 'modify') {
        return compile_alter_modify({ statement, path, database_type })
    }

    if (statement.alter_operation === 'drop') {
        return compile_alter_drop({ statement, path, database_type })
    }

    if (statement.alter_operation === 'rename_column') {
        return compile_alter_rename_column({ statement, path, database_type })
    }

    if (statement.alter_operation === 'rename_table') {
        return compile_alter_rename_table({ statement, path, database_type })
    }

    throw new Error('Unrecognized statement')
}

export const validate_alter_table = ({
    statement,
    path,
    database_type
}: CompilerArgs<AlterTable>) => {
    // sqlite not supported

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
            (definition, i) => {
                const definition_path = [...path, 'definitions', i]

                return validate_alter_definition({
                    statement: definition,
                    path: definition_path,
                    database_type
                })
            }
        )

        return [...base_errors, ...definition_errors]
    }
}

const validate_alter_definition = ({
    statement,
    path,
    database_type
}: CompilerArgs<AlterDefinition>) => {
    if (statement.alter_operation === 'add') {
        return validate_alter_add({
            statement,
            path,
            database_type
        })
    }

    if (statement.alter_operation === 'modify') {
        return validate_alter_modify({
            statement,
            path,
            database_type
        })
    }

    if (statement.alter_operation === 'drop') {
        return validate_alter_drop({
            statement,
            path,
            database_type
        })
    }

    if (statement.alter_operation === 'rename_column') {
        return validate_alter_rename_column({
            statement,
            path,
            database_type
        })
    }

    if (statement.alter_operation === 'rename_table') {
        return validate_alter_rename_table({
            statement,
            path,
            database_type
        })
    }

    throw new Error('Unrecognized definition type')
}

export type AlterTable = {
    readonly alter_table: string
    readonly definitions: AlterDefinition[]
}

type AlterDefinition =
    | AlterAdd
    | AlterModify
    | AlterRenameTable
    | AlterRenameColumn
    | AlterDrop
