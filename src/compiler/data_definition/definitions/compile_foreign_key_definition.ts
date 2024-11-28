import { escape_identifier } from '../../../helpers/escape'
import { validate, ValidationSchema } from '../../common/validator'
import { DDLCompilerArgs, DDLValidatorArgs } from '../../compiler'

export const compile_foreign_key_definition = ({
    statement,
    database_type
}: DDLCompilerArgs<ForeignKeyDefinition>) => {
    const name_string = statement.name ? ` ${statement.name}` : ''

    const columns_string = statement.columns
        .map(col => escape_identifier(database_type, col))
        .join(', ')

    const referenced_columns_string = statement.referenced_columns
        .map(col => escape_identifier(database_type, col))
        .join(', ')

    const on_delete_string = statement.on_delete
        ? ` ON DELETE ${get_on_trigger_string(statement.on_update)}`
        : ''
    const on_update_string = statement.on_update
        ? ` ON UPDATE ${get_on_trigger_string(statement.on_update)}`
        : ''

    return `CONSTRAINT${name_string} FOREIGN KEY (${columns_string}) REFERENCES ${statement.referenced_table}(${referenced_columns_string})${on_delete_string}${on_update_string}`
}

const get_on_trigger_string = (
    on_trigger: ForeignKeyDefinition['on_update']
) => {
    if (!on_trigger) return ''

    if ('restrict' in on_trigger) return 'RESTRICT'
    if ('cascade' in on_trigger) return 'CASCADE'
    if ('set_null' in on_trigger) return 'SET NULL'
    if ('no_action' in on_trigger) return 'NO ACTION'
}

const on_trigger_schema: ValidationSchema = {
    anyOf: ['restrict', 'cascade', 'set_null', 'no_action'].map(el => ({
        type: 'object',
        properties: {
            [el]: {
                type: 'boolean'
            }
        },
        required: [el]
    }))
}

export const validate_foreign_key_definition = ({
    statement,
    path
}: DDLValidatorArgs<ForeignKeyDefinition>) => {
    const errors = validate(
        {
            type: 'object',
            properties: {
                constraint: { enum: new Set(['foreign_key']) },
                columns: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 1
                },
                name: {
                    type: 'string'
                },
                references: {
                    type: 'object',
                    properties: {
                        table: { type: 'string', minLength: 1 },
                        columns: {
                            type: 'array',
                            minItems: 1,
                            items: { type: 'string', minLength: 1 }
                        }
                    },
                    required: ['table', 'columns']
                },
                on_delete: on_trigger_schema,
                on_update: on_trigger_schema
            },
            required: ['constraint', 'columns', 'references']
        },
        path,
        statement
    )

    return errors
}

export type ForeignKeyDefinition = {
    constraint: 'foreign_key'
    columns: readonly string[]
    name?: string
    referenced_table: string
    referenced_columns: readonly string[]
    on_delete?: OnTrigger
    on_update?: OnTrigger
}

export type OnTrigger =
    | { readonly restrict: boolean }
    | { readonly cascade: boolean }
    | { readonly set_null: boolean }
    | { readonly no_action: boolean }
