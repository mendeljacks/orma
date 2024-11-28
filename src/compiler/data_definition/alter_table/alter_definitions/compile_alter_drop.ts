import { escape_identifier } from '../../../../helpers/escape'
import { validate } from '../../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../../compiler'
import { ColumnDefinition } from '../../definitions/compile_column_definition'
import { ForeignKeyDefinition } from '../../definitions/compile_foreign_key_definition'
import { IndexDefinition } from '../../definitions/compile_index_definition'
import { PrimaryKeyDefintion } from '../../definitions/compile_primary_key_definition'
import { UniqueKeyDefinition } from '../../definitions/compile_unique_key_definition'

export const compile_alter_drop = ({
    statement,
    database_type
}: DDLCompilerArgs<AlterDrop>) => {
    const name = escape_identifier(database_type, statement.name)

    const drop_index_supported =
        database_type !== 'postgres' && database_type !== 'sqlite'
    if ('index' in statement) {
        return drop_index_supported ? `DROP INDEX ${name}` : ''
    }

    if ('constraint' in statement) {
        // drop constraint not supported in sqlite
        if (database_type === 'sqlite') return ''

        return `DROP CONSTRAINT ${name}`
    }

    // drop column
    return `DROP ${name}`
}

export const validate_alter_drop = ({
    statement,
    path
}: DDLValidatorArgs<AlterDrop>) => {
    return validate(
        {
            type: 'object',
            properties: {
                alter_operation: { enum: new Set(['drop']) },
                name: { type: 'string', minLength: 1 },
                // were just checking truthy on these props so we dont really care about
                // the schema
                index: {},
                constraint: {}
            },
            required: ['alter_operation', 'name']
        },
        path,
        statement
    )
}

export type AlterDrop =
    | (AlterDropProp & Pick<ColumnDefinition, 'name'>)
    | (AlterDropProp & Pick<IndexDefinition, 'index' | 'name'>)
    | (AlterDropProp & Pick<PrimaryKeyDefintion, 'constraint' | 'name'>)
    | (AlterDropProp & Pick<UniqueKeyDefinition, 'constraint' | 'name'>)
    | (AlterDropProp & Pick<ForeignKeyDefinition, 'constraint' | 'name'>)

type AlterDropProp = { readonly alter_operation: 'drop' }
