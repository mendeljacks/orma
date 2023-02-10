import { mysql_to_typescript_types } from '../../schema/introspector'

export type CreateStatement = RegularCreateStatement | CreateLikeStatement

export type RegularCreateStatement = {
    $create_table: string
    $temporary?: boolean
    $if_not_exists?: boolean
    $comment?: string
    $definitions: Definition[]
}

export type CreateLikeStatement = { $create_table: string; $like_table: string }

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

export type Definition =
    | FieldDefinition
    | IndexDefinition
    | ConstraintDefinition

// these definitions have never props to make intellisense work. Its basically some more arcane typescript witchcraft
// to do with discriminated unions
export type FieldDefinition = {
    $constraint?: never
    $index?: never
    $name: string
    $data_type: keyof typeof mysql_to_typescript_types
    $enum_values?: string[],
    $precision?: number,
    $scale?: number
    $unsigned?: boolean
    $not_null?: boolean
    $auto_increment?: boolean
    $default?: string | number | Record<string, any> // TODO: make this use an Expression type
    $on_update?: string | number | Record<string, any> // TODO: make this use an Expression type
    $comment?: string
}

export type IndexDefinition = {
    $constraint?: never
    $data_type?: never
    $index: true | 'full_text' | 'spatial'
    $fields: string[]
    $name?: string
    $comment?: string
    $invisible?: boolean
}

export type ConstraintDefinition =
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

export type OnTrigger =
    | { $restrict: true }
    | { $cascade: true }
    | { $set_null: true }
    | { $no_action: true }
