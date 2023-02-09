import { XOR } from '../helper_types'
import {
    DeepReadonly,
    FieldSchemaPropEq,
    FilterFieldsBySchemaProp,
    GetAllEdges,
    GetAllEntities,
    GetFieldNotNull,
    GetFields,
    GetFieldsByRequired,
    GetFieldType,
    GetParentEdges,
} from '../schema/schema_helper_types'
import { OrmaSchema } from '../schema/schema_types'

export type OrmaMutation<Schema extends OrmaSchema> = DeepReadonly<
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
>

type MutationRecord<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    RequireOperation extends boolean
> = FieldsObj<Schema, Entity> &
    OperationObj<RequireOperation> &
    ForeignKeyFieldsObj<Schema, Entity, GetAllEdges<Schema, Entity>>

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
    [Field in GetFields<Schema, Entity>]?:
        | FieldType<Schema, Entity, Field>
        // primary or foreign keys can have guids
        | (Field extends GetAllEdges<Schema, Entity>['from_field']
              ? { $guid: string | number }
              : never)
}
// & {
//     // required props have to be given
//     [Field in GetFieldsByRequired<Schema, Entity, true>]: FieldType<
//         Schema,
//         Entity,
//         Field
//     >
// }

export type ForeignKeyFieldsObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    AllEdges extends GetAllEdges<Schema, Entity>
> = AllEdges extends GetAllEdges<Schema, Entity>
    ? {
          [Field in AllEdges['to_entity']]?: MutationRecord<
              Schema,
              Field,
              false
          >[]
      }
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
> = GetFieldNotNull<Schema, Entity, Field> extends true ? never : null //| undefined
