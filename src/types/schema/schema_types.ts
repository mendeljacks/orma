import { Edge } from '../../helpers/schema_helpers'
import { mysql_to_typescript_types } from '../../introspector/introspector'

// sql types
export type CreateStatement =
    | {
          $create_table: string
          $temporary?: boolean
          $if_not_exists?: boolean
          $comment?: string
          $definitions: Definition[]
      }
    | { $create_table: string; $like_table: string }

export type AlterStatement = {
    $alter_table: string
    $definitions: (
        | IntersectOverUnion<Definition, { $alter_operation: 'add' }>
        | (FieldDefinition & { $alter_operation: 'modify'; $old_name: string })
        | ({ $alter_operation: 'drop' } & Pick<
              Definition,
              '$constraint' | '$index' | '$name'
          >)
    )[]
}

type IntersectOverUnion<T, Add> = T extends T ? T & Add : never

type Definition = FieldDefinition | IndexDefinition | ConstraintDefinition

// these definitions have never props to make intellisense work. Its basically some more arcane typescript witchcraft
type FieldDefinition = {
    $constraint?: never
    $index?: never
    $name: string
    $data_type: [keyof typeof mysql_to_typescript_types, ...number[]]
    $not_null?: boolean
    $auto_increment?: boolean
    $default?: string | number | Record<string, any> // TODO: make this use an Expression type
    $on_update?: string | number | Record<string, any> // TODO: make this use an Expression type
}

type IndexDefinition = {
    $constraint?: never
    $data_type?: never
    $index: true | 'full_text' | 'spatial'
    $fields: string[]
    $name?: string
    $comment?: string
    $invisible?: boolean
}

type ConstraintDefinition =
    | {
          $index?: never
          $data_type?: never
          $constraint: 'unique' | 'primary_key'
          $fields: string[]
          $name?: string
          $comment?: string
          $invisible?: boolean
      }
    | {
          $index?: never
          $data_type?: never
          $constraint: 'foreign_key'
          $fields: string[]
          $name?: string
          $references: {
              $entity: string
              $fields: string[]
          }
          $on_delete?: OnTrigger
          $on_update?: OnTrigger
      }

type OnTrigger =
    | { $restrict: true }
    | { $cascade: true }
    | { $set_null: true }
    | { $no_action: true }

export type OrmaSchema = {
    readonly $entities: {
        readonly [entity_name: string]: OrmaEntitySchema
    }
    $cache?: OrmaSchemaCache
}

export type OrmaSchemaCache = {
    $reversed_foreign_keys: {
        readonly [referenced_entity: string]: readonly ForeignKeyEdge[]
    }
}

export type ForeignKeyEdge = Omit<Edge, 'from_entity'>

export type OrmaEntitySchema = {
    readonly $database_type: SupportedDbs
    readonly $comment?: string
    readonly $indexes?: readonly OrmaIndexSchema[]
    readonly $foreign_keys?: readonly ForeignKeyEdge[]
    readonly $fields: {
        readonly [field_name: string]: OrmaFieldSchema
    }
}

export type OrmaFieldSchema = {
    readonly data_type?: keyof typeof mysql_to_typescript_types
    readonly character_count?: number
    readonly ordinal_position?: number
    readonly decimal_places?: number
    readonly not_null?: boolean
    readonly primary_key?: boolean
    readonly unsigned?: boolean
    readonly indexed?: boolean
    readonly default?: string | number
    readonly comment?: string
    readonly auto_increment?: boolean
    readonly enum_values?: readonly (string | number)[]
    // readonly references?: {
    //     readonly [referenced_entity: string]: {
    //         readonly [referenced_field: string]: {
    //             readonly [key: string]: never
    //         }
    //     }
    // }
}

export type OrmaIndexSchema = {
    readonly index_name?: string
    readonly is_unique?: boolean
    readonly fields: readonly string[]
    readonly index_type?: string
    readonly invisible?: boolean
    readonly collation?: 'A' | 'D'
    readonly sub_part?: number | null
    readonly packed?: string | null
    readonly extra?: string
    readonly index_comment?: string
    readonly expression?: string
}

export type SupportedDbs = 'mysql' | 'postgres'
