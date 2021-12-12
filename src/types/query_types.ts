import { orma_field_schema, orma_schema } from '../introspector/introspector'
import { AllowType, IsUnion, Pluck } from './helper_types'
import {
    GetAllEdges,
    GetAllEntities,
    GetFields,
    OrmaSchema,
} from './schema_types'

export type Query<Schema extends OrmaSchema> = {
    [Entity in GetAllEntities<Schema>]?: // | (Subquery<Schema, GetAllEntities<Schema>, true> & {___asdasd?: never})
    Subquery<Schema, Entity, false>
} & {
    [VirtualEntity in string]?: Subquery<Schema, GetAllEntities<Schema>, false> //UnknownSubquery<Schema, GetAllEntities<Schema>>
}

// export type UnknownSubquery<
//     Schema extends OrmaSchema,
//     PossibleEntities extends GetAllEntities<Schema>
// > =
//     // we have to split into two if statements so that we can essentially cache the result of IsUnion so we can check
//     // if its a union before the next if statement distributes the different entities (an then no entity is a union,
//     // since after distribution there are only single entities)
//     IsUnion<PossibleEntities> extends AllowType<infer RequireFrom, boolean>
//         ? PossibleEntities extends any
//             ? Subquery<Schema, PossibleEntities, RequireFrom>
//             : never
//         : never

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
