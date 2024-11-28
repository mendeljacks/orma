import { validate } from '../../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../../compiler'
import { ColumnDefinition } from '../../definitions/compile_column_definition'
import {
    compile_definition,
    validate_definition
} from '../../definitions/compile_definition'
import { ForeignKeyDefinition } from '../../definitions/compile_foreign_key_definition'
import { IndexDefinition } from '../../definitions/compile_index_definition'
import { PrimaryKeyDefintion } from '../../definitions/compile_primary_key_definition'
import { UniqueKeyDefinition } from '../../definitions/compile_unique_key_definition'

export const compile_alter_add = ({
    statement,
    database_type
}: DDLCompilerArgs<AlterAdd>) => {
    return `ADD ${compile_definition({ statement, database_type })}`
}

export const validate_alter_add = ({
    statement,
    path,
    database_type
}: DDLValidatorArgs<AlterAdd>) => {
    const alter_add_errors = validate(
        {
            type: 'object',
            properties: { alter_operation: { enum: new Set(['add']) } },
            required: ['alter_operation']
        },
        path,
        statement
    )
    const definition_errors = validate_definition({
        statement,
        path,
        database_type
    })

    return [...alter_add_errors, ...definition_errors]
}

export type AlterAdd =
    | (AlterAddProp & ColumnDefinition)
    | (AlterAddProp & IndexDefinition)
    | (AlterAddProp & PrimaryKeyDefintion)
    | (AlterAddProp & UniqueKeyDefinition)
    | (AlterAddProp & ForeignKeyDefinition)

type AlterAddProp = { readonly alter_operation: 'add' }
