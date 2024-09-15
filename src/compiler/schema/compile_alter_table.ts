import path = require('path')

import {
    compile_definition,
    Definition,
    validate_definition
} from './definitions/compile_definition'
import { ColumnDefinition } from './definitions/compile_column_definition'
import { IndexDefinition } from './definitions/compile_index_definition'
import { PrimaryKeyDefintion } from './definitions/compile_primary_key_definition'
import { UniqueKeyDefinition } from './definitions/compile_unique_key_definition'
import { ForeignKeyDefinition } from './definitions/compile_foreign_key_definition'
import { escape_column } from '../../helpers/escape'
import { CompilerArgs } from '../compiler'

export const compile_create_table = ({
    statement,
    path,
    database_type
}: CompilerArgs<AlterStatement>) => {
    const table_string = `ALTER TABLE ${escape_column(
        statement.alter_table,
        database_type
    )}`
    
}

export const validate_create_table = ({
    statement,
    path,
    database_type
}: CompilerArgs<AlterStatement>) => {
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

export type AlterStatement = {
    readonly alter_table: string
    readonly definitions: (
        | AlterAddStatement
        | AlterModifyStatement
        | AlterDropStatement
    )[]
}

type AlterAddStatement =
    | (AlterAdd & ColumnDefinition)
    | (AlterAdd & IndexDefinition)
    | (AlterAdd & PrimaryKeyDefintion)
    | (AlterAdd & UniqueKeyDefinition)
    | (AlterAdd & ForeignKeyDefinition)

type AlterAdd = { readonly alter_operation: 'add' }

type AlterModifyStatement =
    | ColumnDefinition & {
          readonly alter_operation: 'modify'
          readonly old_name: string
      }

type AlterDropStatement =
    | (AlterDrop & Pick<ColumnDefinition, 'name'>)
    | (AlterDrop & Pick<IndexDefinition, 'index' | 'name'>)
    | (AlterDrop & Pick<PrimaryKeyDefintion, 'constraint' | 'name'>)
    | (AlterDrop & Pick<UniqueKeyDefinition, 'constraint' | 'name'>)
    | (AlterDrop & Pick<ForeignKeyDefinition, 'constraint' | 'name'>)

type AlterDrop = { readonly alter_operation: 'drop' }

export type DropStatement = {
    drop_table: string
    if_exists?: boolean
    temporary?: boolean
}

export type TruncateStatement = {
    truncate_table: string
}
