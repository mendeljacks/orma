import { Pluck } from '../helper_types'
import {
    DeepReadonly,
    GetAllEdges,
    GetAllEntities,
    GetFields,
    OrmaSchema,
} from '../schema_types'

export type OrmaQuery<Schema extends OrmaSchema> = {
    [Entity in GetAllEntities<Schema>]?: Subquery<Schema, Entity, false>
} & {
    // virtual entities cant really be $where_connected macros, but we need this due to limitations with typescript
    [VirtualEntity in string]?:
        | Subquery<Schema, GetAllEntities<Schema>, false>
        | WhereConnected<OrmaSchema>
} &
{ $where_connected?: WhereConnected<Schema> }

export type WhereConnected<Schema extends OrmaSchema> = WhereConnectedMapped<Schema, GetAllEntities<Schema>>

// uselessly have to break this into two because typescript is annoying
type WhereConnectedMapped<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>
> = Entities extends any
    ? {
          $entity: Entities
          $field: GetFields<Schema, Entities>
          $values: (string | number)[]
      }[]
    : never


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
          GroupByObj<Schema, Entities> &
          OrderByObj<Schema, Entities>
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
    | OrderBy<Schema, Entity>
    | any[] // TODO: replace this with a proper type for a $where clause. any[] is just for $eq: [] clauses

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
> =
    | {
          $sum: Expression<Schema, Entity>
      }
    | {
          $min: Expression<Schema, Entity>
      }
    | {
          $max: Expression<Schema, Entity>
      }
    | {
          $coalesce: Expression<Schema, Entity>
      }
    | GetFields<Schema, Entity>

export type PaginationObj = {
    $limit?: number
    $offset?: number
}

// any entity name
export type GroupByObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    $group_by?: GroupBy<Schema, Entity>
}

type FieldOrString<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = GetFields<Schema, Entity> | (string & {})

type GroupBy<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = readonly (FieldOrString<Schema, Entity> | Expression<Schema, Entity>)[]

export type OrderByObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    $order_by?: OrderBy<Schema, Entity>
}

type OrderBy<Schema extends OrmaSchema, Entity extends GetAllEntities<Schema>> =
    // using readonly allows us to do as const in the as_orma_query wrapper function which is needed to do
    // type narrowing (for some reason types arent narrowing with both schema and query params)
    readonly (
        | FieldOrString<Schema, Entity>
        | Expression<Schema, Entity>
        | { $asc: FieldOrString<Schema, Entity> | Expression<Schema, Entity> }
        | { $desc: FieldOrString<Schema, Entity> | Expression<Schema, Entity> }
    )[]
