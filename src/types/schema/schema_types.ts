import { Edge } from '../../helpers/schema_helpers'
import { Optional } from '../helper_types'
import {
    ConstraintDefinition,
    FieldDefinition,
    IndexDefinition,
    RegularCreateStatement,
} from './schema_ast_types'

export type OrmaSchema = {
    readonly $entities: {
        readonly [Key: string]: OrmaEntitySchema
    }
    readonly $cache?: OrmaSchemaCache
}

type PrimaryOrUniqueConstraint = Omit<
    Extract<
        ConstraintDefinition,
        { $constraint: 'primary_key' | 'unique_key' }
    >,
    '$constraint' | '$index' | '$data_type'
>

type OrmaForeignKey = Omit<
    Extract<ConstraintDefinition, { $constraint: 'foreign_key' }>,
    '$constraint' | '$index' | '$data_type'
>

type OrmaIndex = Optional<
    Omit<IndexDefinition, '$constraint' | '$data_type'>,
    '$index'
>

type OrmaEntitySchema = Omit<
    RegularCreateStatement,
    '$definitions' | '$create_table' | '$if_not_exists' | '$temporary'
> & {
    readonly $database_type: SupportedDatabases
    readonly $fields: {
        readonly [field_name: string]: Omit<
            FieldDefinition,
            '$constraint' | '$index' | '$name'
        >
    }
    readonly $primary_key: PrimaryOrUniqueConstraint
    readonly $indexes?: readonly OrmaIndex[]
    readonly $unique_keys?: readonly PrimaryOrUniqueConstraint[]
    readonly $foreign_keys?: readonly OrmaForeignKey[]
}

type OrmaSchemaCache = {
    readonly $reversed_foreign_keys: {
        readonly [referenced_entity: string]: readonly ForeignKeyEdge[]
    }
}

export type ForeignKeyEdge = Omit<Edge, 'from_entity'>

export type SupportedDatabases = 'mysql' | 'postgres' | 'sqlite'