import { Edge } from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { UnionToIntersection, XOR } from '../helper_types'
import {
    OrmaSchema,
    GetAllEntities,
    GetFields,
    GetFieldSchema,
    FilterFieldsBySchemaProp,
    GetFieldType,
    FieldSchemaPropEq,
    GetParentEdges,
} from '../schema_types'

export type OrmaMutation<Schema extends OrmaSchema> =
    | {
          [Entity in GetAllEntities<Schema>]?: MutationRecord<
              Schema,
              Entity,
              // we only need to do this on the top level, since after the highest entity everything will have an operation,
              // either directly provided or through cascading from the highest entity
              true
          >[]
      }
    | ({
          [Entity in GetAllEntities<Schema>]?: MutationRecord<
              Schema,
              Entity,
              false
          >[]
      } & {
          $operation: Operation
      })

type MutationRecord<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    RequireOperation extends boolean
> = FieldsObj<Schema, Entity> &
    OperationObj<RequireOperation> &
    ForeignKeyFieldsObj<
        Schema,
        Entity,
        GetParentEdges<Schema, Entity>,
        RequireOperation
    >

type OperationObj<RequireOperation extends boolean> =
    RequireOperation extends true
        ? {
              $operation: Operation
          }
        : {
              $operation?: Operation
          }

type Operation = 'create' | 'update' | 'delete'

type FieldsObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    // baseline for regular props
    [Field in GetFields<Schema, Entity>]?: FieldType<Schema, Entity, Field>
} & {
    // required props have to be given
    [Field in FilterFieldsBySchemaProp<
        Schema,
        Entity,
        'nullable',
        // TODO: check if this works after switching from 'required' to 'nullable', since its a filter not eq
        false | undefined
    >]: FieldType<Schema, Entity, Field>
}

type ForeignKeyFieldsObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    ParentEdges extends GetParentEdges<Schema, Entity>,
    RequireOperation extends boolean
> = ParentEdges extends GetParentEdges<Schema, Entity>
    ? XOR<
          {
              [Field in ParentEdges['from_field']]: FieldType<
                  Schema,
                  Entity,
                  Field
              >
          },
          {
              [Field in ParentEdges['to_entity']]: MutationRecord<
                  Schema,
                  Field,
                  false
              >[]
          }
      >
    : never

// type ForeignKeyFieldsObj<
//     Schema extends OrmaSchema,
//     Entity extends GetAllEntities<Schema>,
//     ParentEdges extends GetParentEdges<Schema, Entity>
// > = UnionToIntersection<
//     ParentEdges extends GetParentEdges<Schema, Entity>
//         ? {
//               [Field in ParentEdges['to_entity']]: 1
//           }
//         : never
// >

export type FieldType<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> =
    | GetFieldType<Schema, Entity, Field> // base type
    // add null to base type only if field is not required
    | NullableField<Schema, Entity, Field>

type NullableField<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> = FieldSchemaPropEq<Schema, Entity, Field, 'required', true> extends true
    ? never
    : null | undefined
