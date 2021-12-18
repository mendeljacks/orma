import { BooleanOr, IsEqual, IsExtends } from '../helper_types'
import {
    GetAllEntities,
    GetFields,
    GetFieldType,
    Keyword,
    OrmaSchema,
} from '../schema_types'
import { OrmaQuery } from './query_types'

export type QueryResult<
    Schema extends OrmaSchema,
    Query extends OrmaQuery<Schema>
> = StripKeywords<WrapInArrays<AddSchemaTypes<Schema, Query>>>

export type AddSchemaTypes<
    Schema extends OrmaSchema,
    Obj,
    ParentKey extends string | unknown = unknown
> = {
    [Key in keyof Obj]: IsSubquery<Obj[Key]> extends true // for subqueries, call this type recursively
        ? AddSchemaTypes<Schema, Obj[Key], Key>
        : Obj extends { $from: GetAllEntities<Schema> }
        ? GetSchemaTypeForField<Schema, Obj['$from'], Key, Obj[Key]>
        : ParentKey extends GetAllEntities<Schema> // to get a type from the schema, we need
        ? GetSchemaTypeForField<Schema, ParentKey, Key, Obj[Key]>
        : any
}

type GetSchemaTypeForField<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Key,
    Value
> = IsEqual<Value, true> extends true
    ? Key extends GetFields<Schema, Entity>
        ? GetFieldType<Schema, Entity, Key>
        : any
    : Value extends GetFields<Schema, Entity>
    ? GetFieldType<Schema, Entity, Value>
    : any

// BooleanOr<IsEqual<Obj[Key], true>, IsExtends<ParentKey, GetAllEntities<Schema>>> extends true

export type WrapInArrays<Obj> = Obj extends object // recursively called on objects and arrays
    ? {
          [Key in keyof Obj]: IsSubquery<Obj[Key]> extends true
              ? WrapInArrays<Obj[Key]>[]
              : WrapInArrays<Obj[Key]>
      }
    : Obj

export type IsSubquery<Obj> = Obj extends object // subqueries are objects
    ? Obj extends { $from: string } // subquery either has a $from property
        ? true
        : {} extends StripKeywords<Obj> // or has at least one data prop (i.e. not a keyword like $limit)
        ? false
        : true
    : false

export type StripKeywords<Obj> = Obj extends object // called recursively on objects and arrays
    ? Omit<
          {
              [Key in keyof Obj]: StripKeywords<Obj[Key]>
          },
          Keyword
      >
    : Obj

type t = true | false extends true ? true : false
type t2 = true | true
