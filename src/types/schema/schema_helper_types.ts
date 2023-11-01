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
          from_field: Edges['from_field'] extends GetFields<
              Schema,
              GetAllEntities<Schema>
          >
              ? Edges['from_field']
              : never
          to_entity: Edges['to_entity'] extends GetAllEntities<Schema>
              ? Edges['to_entity']
              : never
      }
    : never

export type GetAllEdges<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>
> = GetParentEdges<Schema, Entities> | GetChildEdges<Schema, Entities>

/*
So this type actually used to be split into 3 for readability, but it was causing performance issues
so I uglified it, endowing it with lots of repetition and making it hard to follow. Pretty sure its faster
now though.
*/
export type GetFieldType<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> = Field extends GetFields<Schema, Entity>
    ? AddNull<
          Schema['$entities'][Entity]['$fields'][Field] extends {
              $data_type: 'enum'
              $enum_values: readonly any[]
          }
              ? Schema['$entities'][Entity]['$fields'][Field]['$enum_values'][number]
              : FieldTypeStringToType<
                    MysqlToTypescriptTypeString<
                        NonNullable<
                            Schema['$entities'][Entity]['$fields'][Field]['$data_type']
                        >
                    >
                >,
          Schema['$entities'][Entity]['$fields'][Field]['$not_null'] extends true
              ? false
              : true
      >
    : never

type AddNull<T, AddNull extends boolean> = AddNull extends true ? T | null : T

export type GetFieldSchema<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> = Schema['$entities'][Entity]['$fields'][Field] extends OrmaFieldSchema
    ? Schema['$entities'][Entity]['$fields'][Field]
    : any

type MysqlToTypescriptTypeString<
    TypeString extends keyof typeof mysql_to_typescript_types
> = (typeof mysql_to_typescript_types)[TypeString]

type FieldTypeStringToType<
    TypeString extends (typeof mysql_to_typescript_types)[keyof typeof mysql_to_typescript_types]
> = TypeString extends 'string'
    ? string
    : TypeString extends 'number'
    ? number
    : TypeString extends 'boolean'
    ? number | boolean // mysql doesnt really support booleans
    : TypeString extends 'date'
    ? Date
    : any

type OrmaForeignKey = NonNullable<
    OrmaSchema['$entities'][string]['$foreign_keys']
>[number]

type OrmaFieldSchema = NonNullable<
    OrmaSchema['$entities'][string]['$fields']
>[string]
