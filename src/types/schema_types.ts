// generate type for orma schema which plays well with as const declarations

import { Edge } from '../helpers/schema_helpers'
import {
    mysql_to_typescript_types,
    orma_field_schema,
    orma_schema,
} from '../introspector/introspector'
import { IsEqual, UnionToIntersection } from './helper_types'

export type DeepReadonly<T> = T extends (infer R)[]
    ? DeepReadonlyArray<R>
    : T extends Function
    ? T
    : T extends object
    ? DeepReadonlyObject<T>
    : T

export interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}

export type DeepReadonlyObject<T> = {
    readonly [P in keyof T]: DeepReadonly<T[P]>
}

export type OrmaSchema = DeepReadonly<orma_schema>

// basic structure

export type Keyword = `$${string}`
export type IsKeyword<Field> = Field extends Keyword ? true : false

// /**
//  * Non keywords cannot start with a $
//  */
// export type NonKeyword = `${
//     | LowercaseChar
//     | UppercaseChar
//     | NumericChar
//     | '_'}${string}`

// export type IsNotKeywordHelper<F extends string> = F extends `$${string}` ? never : string

// export type IsNotKeyword<Field extends IsNotKeywordHelper<Field>> = Field

export type GetStringKeys<T> = Extract<keyof T, string>

export type GetAllEntities<Schema extends OrmaSchema> = GetStringKeys<Schema> // the type keyof Schema can be numbers also, but we only want string keys

export type GetFields<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = Entity extends any ? Exclude<GetStringKeys<Schema[Entity]>, Keyword> : never

export type GetParentEdges<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>
> = Entities extends GetAllEntities<Schema>
    ? GetParentEdgesForFields<Schema, Entities, GetFields<Schema, Entities>>
    : never

export type GetParentEdgesForFields<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Fields extends GetFields<Schema, Entity>
> = Fields extends GetFields<Schema, Entity> // map over fields
    ? Schema[Entity][Fields] extends { references: any } // filter fields to only include ones with foreign keys
        ? {
              from_entity: Entity
              to_entity: GetStringKeys<Schema[Entity][Fields]['references']> // pull out entity from { references: { ... }}
              from_field: Fields
              to_field: GetStringKeys<
                  Schema[Entity][Fields]['references'][GetStringKeys<
                      Schema[Entity][Fields]['references']
                  >]
              > // pull out field from references objecs
          }
        : never
    : never

// Fields extends any // map over fields
//     ? Schema[Entity][Fields] extends { references: any } // filter fields to only include ones with foreign keys
//         ? {
//               from_entity: Entity
//               to_entity: GetStringKeys<Schema[Entity][Fields]['references']> // pull out entity from { references: { ... }}
//               from_field: Fields
//               to_field: GetStringKeys<
//                   Schema[Entity][Fields]['references'][GetStringKeys<
//                       Schema[Entity][Fields]['references']
//                   >]
//               > // pull out field from references objecs
//           }
//         : never
//     : never

export type GetParentEdgesForAllEntities<Schema extends OrmaSchema> =
    GetParentEdges<Schema, GetAllEntities<Schema>>

export type GetChildEdges<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>
> = GetChildEdgesFromParentEdges<Schema, GetParentEdgesForAllEntities<Schema>>

export type GetChildEdgesFromParentEdges<
    Schema extends OrmaSchema,
    ParentEdges extends GetParentEdgesForAllEntities<Schema>
> = ParentEdges extends any ? ReverseEdge<ParentEdges> : never

export type ReverseEdge<EdgeParam extends Edge> = {
    from_entity: EdgeParam['to_entity']
    from_field: EdgeParam['to_field']
    to_entity: EdgeParam['from_entity']
    to_field: EdgeParam['from_field']
}

export type GetAllEdges<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>
> = FilterEdgeByFromEntity<
    GetParentEdges<Schema, Entities> | GetChildEdges<Schema, Entities>,
    Entities
>

type FilterEdgeByFromEntity<
    EdgeParams extends Edge,
    Entities
> = EdgeParams extends { from_entity: Entities } ? EdgeParams : never

export type GetFieldType<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> = Schema[Entity][Field] extends { data_type: any }
    ? FieldTypeStringToType<
          MysqlToTypescriptTypeString<Schema[Entity][Field]['data_type']>
      >
    : any

export type GetFieldSchema<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> = Schema[Entity][Field] extends orma_field_schema
    ? Schema[Entity][Field]
    : any

type MysqlToTypescriptTypeString<
    TypeString extends keyof typeof mysql_to_typescript_types
> = typeof mysql_to_typescript_types[TypeString]

type FieldTypeStringToType<
    TypeString extends typeof mysql_to_typescript_types[keyof typeof mysql_to_typescript_types]
> = TypeString extends 'string'
    ? string
    : TypeString extends 'number'
    ? number
    : TypeString extends 'boolean'
    ? boolean
    : TypeString extends 'date'
    ? Date
    : any

// This type is equivalent to
// fields.filter(field => schema.entities[entity].fields[field][SchemaProp] === value)
// but typescript doesn't have higher kinded types which would allow a filter type,
// so we need this massive, badly abstracted monstrosity instead.
export type FilterFieldsBySchemaProp<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    SchemaProp extends string,
    value
> = FilterFieldsBySchemaPropWithFieldsExplicit<
    Schema,
    Entity,
    GetFields<Schema, Entity>,
    SchemaProp,
    value
>

// type distribution of a union (in the case Fields) via a ternary operator only seems to work if the
// union is passed directly in to the type, but not if its generated (e.g. by GetFields<> type).
// So we need this intermediary layer to make it work. I hate typescript.
type FilterFieldsBySchemaPropWithFieldsExplicit<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Fields extends GetFields<Schema, Entity>,
    SchemaProp extends string,
    value
> = Fields extends any
    ? FieldSchemaPropEq<Schema, Entity, Fields, SchemaProp, value> extends true
        ? Fields
        : never //FilterFieldBySchemaProp<Schema, Entity, Fields, SchemaProp, value>
    : never

type FilterFieldBySchemaProp<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>,
    SchemaProp extends string,
    value
> = GetFieldSchema<Schema, Entity, Field> extends {
    [prop in SchemaProp]: value
}
    ? IsEqual<
          GetFieldSchema<Schema, Entity, Field>[SchemaProp],
          value
      > extends true
        ? Field
        : never
    : never

export type FieldSchemaPropEq<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>,
    SchemaProp extends string,
    value
> = GetFieldSchema<Schema, Entity, Field> extends {
    [prop in SchemaProp]: value
}
    ? IsEqual<GetFieldSchema<Schema, Entity, Field>[SchemaProp], value>
    : false
