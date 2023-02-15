// generate type for orma schema which plays well with as const declarations

import { Edge } from '../../helpers/schema_helpers'
import { mysql_to_typescript_types } from '../../schema/introspector'
import { ForeignKeyEdge, OrmaSchema } from '../schema/schema_types'
import { IsEqual } from '../helper_types'
import { Schema } from 'jsonschema'

export type DeepReadonly<T> = T extends (infer R)[]
    ? readonly DeepReadonly<R>[]
    : T extends Function
    ? T
    : T extends object
    ? {
          readonly [P in keyof T]: DeepReadonly<T[P]>
      }
    : T

// export interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}

// export type DeepReadonlyObject<T> = {
//     readonly [P in keyof T]: DeepReadonly<T[P]>
// }
// type T = ReadonlyArray<string[]>

export type Keyword = `$${string}`

export type DeepMutable<T> = T extends Function
    ? T
    : { -readonly [P in keyof T]: DeepMutable<T[P]> }

// basic structure

export type GetAllEntities<Schema extends OrmaSchema> = Extract<
    keyof Schema['$entities'],
    string
> // the type keyof Schema can be numbers also, but we only want string keys

export type GetFields<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = Entity extends GetAllEntities<Schema>
    ? // we need to use a ternary to map over the given Entity (which may be a union). This lets
      // GetFields<Schema, 'entity1' | 'entity2'> return the union of all the fields of entity1 and entity2
      keyof Schema['$entities'][Entity]['$fields']
    : never

// get a union of fields that either are nullable or are not nullable
export type GetFieldNotNull<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> = Schema['$entities'][Entity]['$fields'][Field]['$not_null'] extends true
    ? true
    : false

// get a union of fields that either are nullable or are not nullable
export type GetFieldsByRequired<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    IsRequired extends boolean
> = GetFieldsByRequired2<Schema, Entity, GetFields<Schema, Entity>, IsRequired>

type GetFieldsByRequired2<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Fields extends GetFields<Schema, Entity>,
    IsRequired extends boolean
> = Fields extends GetFields<Schema, Entity>
    ? GetFieldIsRequired<
          Schema['$entities'][Entity]['$fields'][Fields],
          Fields,
          GetParentEdges<Schema, Entity>['from_field']
      > extends IsRequired
        ? Fields
        : never
    : never

// a field is required if it is not nullable, and there is no auto_increment or default. Also foreign keys are considered
// not required, since the logic to require them is more complicated and handled elsewhere
export type GetFieldIsRequired<
    FieldSchema extends OrmaFieldSchema,
    Field extends any,
    ForeignKeyFields extends any
> = ForeignKeyFields extends Field
    ? false
    : FieldSchema['$not_null'] extends true
    ? FieldSchema['$auto_increment'] extends true
        ? false
        : FieldSchema['$default'] extends OrmaFieldSchema['$default']
        ? false
        : true
    : false

export type GetParentEdges<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>
> = Entities extends GetAllEntities<Schema>
    ? ForeignKeyToEdge<
          Schema,
          Entities,
          NonNullable<Schema['$entities'][Entities]['$foreign_keys']>[number]
      >
    : never

// export type GetParentEdgesForFields<
//     Schema extends OrmaSchema,
//     Entity extends GetAllEntities<Schema>,
//     Fields extends GetFields<Schema, Entity>
// > = Fields extends GetFields<Schema, Entity> // map over fields
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

export type GetChildEdges<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>
> = CacheToEdge<
    Schema,
    NonNullable<Schema['$cache']>['$reversed_foreign_keys'][Entities][number]
>

type ForeignKeyToEdge<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    ForeignKeys extends OrmaForeignKey
> = ForeignKeys extends OrmaForeignKey
    ? {
          from_field: ForeignKeys['$fields'][0] extends GetFields<
              Schema,
              Entity
          >
              ? ForeignKeys['$fields'][0]
              : never
          // on to_entity included for performance reasons, since that is the only one being used by the types
          to_entity: ForeignKeys['$references']['$entity'] extends GetAllEntities<Schema>
              ? ForeignKeys['$references']['$entity']
              : never
      }
    : never

type CacheToEdge<
    Schema extends OrmaSchema,
    Edges extends ForeignKeyEdge
> = Edges extends ForeignKeyEdge
    ? {
          //   from_entity: Edges['from_entity'] extends GetAllEntities<Schema>
          //       ? Edges['from_entity']
          //       : never
          from_field: Edges['from_field'] extends GetFields<
              Schema,
              GetAllEntities<Schema>
          >
              ? Edges['from_field']
              : never
          to_entity: Edges['to_entity'] extends GetAllEntities<Schema>
              ? Edges['to_entity']
              : never
          //   to_field: Edges['to_field'] extends GetFields<
          //       Schema,
          //       GetAllEntities<Schema>
          //   >
          //       ? Edges['to_field']
          //       : never
      }
    : never

export type GetAllEdges<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>
> = GetParentEdges<Schema, Entities> | GetChildEdges<Schema, Entities>

export type GetFieldType<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> = GetFieldType2<Schema['$entities'][Entity]['$fields'][Field]>

type GetFieldType2<FieldSchema extends OrmaFieldSchema> =
    FieldSchema['$not_null'] extends true
        ? FieldTypeStringToType<
              MysqlToTypescriptTypeString<
                  NonNullable<FieldSchema['$data_type']>
              >
          >
        : FieldTypeStringToType<
              MysqlToTypescriptTypeString<
                  NonNullable<FieldSchema['$data_type']>
              >
          > | null

export type GetFieldSchema<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> = Schema['$entities'][Entity]['$fields'][Field] extends OrmaFieldSchema
    ? Schema['$entities'][Entity]['$fields'][Field]
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
    ? number | boolean // mysql doesnt really support booleans
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

type OrmaForeignKey = NonNullable<
    OrmaSchema['$entities'][string]['$foreign_keys']
>[number]

type OrmaFieldSchema = NonNullable<
    OrmaSchema['$entities'][string]['$fields']
>[string]
