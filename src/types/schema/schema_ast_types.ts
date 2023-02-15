import { mysql_to_typescript_types } from '../../schema/introspector'

export type CreateStatement = RegularCreateStatement | CreateLikeStatement

export type RegularCreateStatement = {
    readonly $create_table: string
    readonly $temporary?: boolean
    readonly $if_not_exists?: boolean
    readonly $comment?: string
    readonly $definitions: readonly Definition[]
}

export type CreateLikeStatement = {
    readonly $create_table: string
    readonly $like_table: string
}

export type AlterStatement = {
    readonly $alter_table: string
    readonly $definitions: (
        | IntersectOverUnion<Definition, { readonly $alter_operation: 'add' }>
        | (FieldDefinition & { readonly $alter_operation: 'modify'; readonly $old_name: string })
        | ({ readonly $alter_operation: 'drop' } & Pick<
              Definition,
              '$constraint' | '$index' | '$name'
          >)
    )[]
}

type IntersectOverUnion<T, Add> = T extends T ? T & Add : never

export type Definition =
    | FieldDefinition
    | IndexDefinition
    | ConstraintDefinition

// these definitions have never props to make intellisense work. Its basically some more arcane typescript witchcraft
// to do with discriminated unions
export type FieldDefinition = {
    readonly $constraint?: never
    readonly $index?: never
    readonly $name: string
    readonly $data_type: keyof typeof mysql_to_typescript_types
    readonly $enum_values?: readonly string[]
    readonly $precision?: number
    readonly $scale?: number
    readonly $unsigned?: boolean
    readonly $not_null?: boolean
    readonly $auto_increment?: boolean
    readonly $default?: string | number | Record<string, any> // TODO: make this use an Expression type
    readonly $on_update?: string | number | Record<string, any> // TODO: make this use an Expression type
    readonly $comment?: string
}

export type IndexDefinition = {
    $constraint?: never
    $data_type?: never
    $index: true | 'full_text' | 'spatial'
    $fields: readonly string[]
    $name?: string
    $comment?: string
    $invisible?: boolean
}

export type ConstraintDefinition =
    | {
          $index?: never
          $data_type?: never
          $constraint: 'unique_key' | 'primary_key'
          $fields: readonly string[]
          $name?: string
          $comment?: string
          $invisible?: boolean
      }
    | {
          $index?: never
          $data_type?: never
          $constraint: 'foreign_key'
          $fields: readonly string[]
          $name?: string
          $references: {
              $entity: string
              $fields: readonly string[]
          }
          $on_delete?: OnTrigger
          $on_update?: OnTrigger
      }

export type OnTrigger =
    | { readonly $restrict: true }
    | { readonly $cascade: true }
    | { readonly $set_null: true }
    | { readonly $no_action: true }
