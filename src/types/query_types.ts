import { Pluck } from './helper_types'
import {
    GetAllEdges,
    GetAllEntities,
    GetFields,
    OrmaSchema,
} from './schema_types'

export type Query<Schema extends OrmaSchema> = {
    [Entity in GetAllEntities<Schema>]?: Subquery<Schema, Entity, false>
} & {
    [VirtualEntity in string]?: Subquery<Schema, GetAllEntities<Schema>, false>
}

export type Subquery<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>,
    RequireFrom extends boolean
> = Entities extends any
    ? FieldProps<Schema, Entities> &
          SubqueryProps<Schema, Entities> &
          VirtualFieldProps<Schema, Entities> &
          FromProps<Schema, Entities, RequireFrom>
    : never

export type FieldProps<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    [Field in GetFields<Schema, Entity>]?: QueryField<Schema, Entity>
}

export type SubqueryProps<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    [SubEntity in Pluck<GetAllEdges<Schema, Entity>, 'to_entity'>]?: Subquery<
        Schema,
        SubEntity,
        false
    >
}

export type VirtualFieldProps<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    [VirtualField in string]?:
        | QueryField<Schema, Entity>
        | Subquery<
              Schema,
              Pluck<GetAllEdges<Schema, Entity>, 'to_entity'>,
              false
          >
        | Entity
}

export type FromProps<
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
