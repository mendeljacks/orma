import { Pluck } from './helper_types'
import {
    GetAllEdges,
    GetAllEntities,
    GetFields, OrmaSchema
} from './schema_types'

export type Query<Schema extends OrmaSchema> = {
    [Entity in GetAllEntities<Schema>]?: Subquery<Schema, Entity, false>
} & {
    [VirtualEntity in string]?: Subquery<
        Schema,
        GetAllEntities<Schema>,
        false
    >
}

export type Subquery<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>,
    RequireFrom extends boolean
> = Entities extends any
    ? FieldObj<Schema, Entities> &
          SubqueryObj<Schema, Entities> &
          VirtualFieldObj<Schema, Entities> &
          FromObj<Schema, Entities, RequireFrom> &
          PaginationObj &
          GroupByObj<Schema, Entities>
    : never

export type FieldObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    [Field in GetFields<Schema, Entity>]?: QueryField<Schema, Entity>
}

export type SubqueryObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    [SubEntity in Pluck<GetAllEdges<Schema, Entity>, 'to_entity'>]?: Subquery<
        Schema,
        SubEntity,
        false
    >
}

export type VirtualFieldObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    [VirtualFieldName in string]?: VirtualField<Schema, Entity>
}

export type VirtualField<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> =
    // not all of these are valid in orma, but we need them because typescript will apply this virtual field type to
    // all other properties too, e.g. $limit: 3 or id: true
    | Subquery<Schema, Pluck<GetAllEdges<Schema, Entity>, 'to_entity'>, false>
    | QueryField<Schema, Entity>
    | Entity
    | number
    | GroupBy<Schema, Entity>

export type FromObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    RequireFrom extends boolean
> = RequireFrom extends true
    ? {
          $from: Entity
      }
    : {
          $from?: Entity
      }

export type QueryField<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = boolean | GetFields<Schema, Entity> | Expression<Schema, Entity>

export type Expression<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    $sum: GetFields<Schema, Entity>
}

export type PaginationObj = {
    $limit?: number
    $offset?: number
}

// any entity name
export type GroupByObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    // $group_by?: Group
}

type GroupBy<Schema extends OrmaSchema, Entity extends GetAllEntities<Schema>> = (GetFields<Schema, Entity> | Expression<Schema, Entity>)[]
