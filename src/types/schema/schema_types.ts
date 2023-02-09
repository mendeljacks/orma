import { Edge } from '../../helpers/schema_helpers'
import { Optional } from '../helper_types'
import {
    ConstraintDefinition,
    CreateStatement,
    FieldDefinition,
    IndexDefinition,
    RegularCreateStatement,
} from './schema_ast_types'
import { DeepReadonly } from './schema_helper_types'

export type OrmaSchema = DeepReadonly<{
    $entities: {
        [Key: string]: OrmaEntitySchema
    }
    $cache?: OrmaSchemaCache
}>

type PrimaryOrUniqueConstraint = Omit<
    Extract<ConstraintDefinition, { $constraint: 'primary_key' | 'unique' }>,
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
    $database_type: SupportedDbs
    $fields: {
        [field_name: string]: Omit<
            FieldDefinition,
            '$constraint' | '$index' | '$name'
        >
    }
    $primary_key: PrimaryOrUniqueConstraint
    $indexes?: OrmaIndex[]
    $unique_keys?: PrimaryOrUniqueConstraint[]
    $foreign_keys?: OrmaForeignKey[]
}

type OrmaSchemaCache = {
    $reversed_foreign_keys: {
        [referenced_entity: string]: ForeignKeyEdge[]
    }
}

export type ForeignKeyEdge = Omit<Edge, 'from_entity'>

export type SupportedDbs = 'mysql' | 'postgres'

const schem = {
    $entities: {
        items: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    $data_type: 'varchar',
                    $precision: 50,
                },
            },
            $unique_keys: [
                {
                    $fields: ['id'],
                },
            ],
            $primary_key: {
                $fields: ['id'],
            },
            $foreign_keys: [
                {
                    $fields: ['parent_id'],
                    $references: {
                        $entity: 'parents',
                        $fields: ['id'],
                    },
                },
            ],
        },
    },
} as const satisfies OrmaSchema
