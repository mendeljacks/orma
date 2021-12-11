// generate type for orma schema which plays well with as const declarations

import { Schema } from 'inspector'
import { Edge } from '../helpers/schema_helpers'
import { orma_schema } from '../introspector/introspector'
import { AllowType, IsType } from './helper_types'

export type DeepReadonly<T> = T extends (infer R)[]
    ? DeepReadonlyArray<R>
    : T extends Function
    ? T
    : T extends object
    ? DeepReadonlyObject<T>
    : T

interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}

type DeepReadonlyObject<T> = {
    readonly [P in keyof T]: DeepReadonly<T[P]>
}

export type OrmaSchema = DeepReadonly<orma_schema>

// basic structure

export type Keyword = `$${string}`
export type IsKeyword<Field extends `$${string}`> = Field

// export type IsNotKeywordHelper<F extends string> = F extends `$${string}` ? never : string

// export type IsNotKeyword<Field extends IsNotKeywordHelper<Field>> = Field

export type GetStringKeys<T> = Extract<keyof T, string>

export type GetAllEntities<Schema extends OrmaSchema> = GetStringKeys<Schema> // the type keyof Schema can be numbers also, but we only want string keys

export type GetFields<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = Exclude<GetStringKeys<Schema[Entity]>, Keyword>

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
> = Fields extends any // map over fields
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