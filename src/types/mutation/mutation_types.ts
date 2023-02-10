import { GlobalTestSchema } from '../../helpers/tests/global_test_schema'
import {
    DeepReadonly,
    GetAllEdges,
    GetAllEntities,
    GetFieldNotNull,
    GetFields,
    GetFieldType,
} from '../schema/schema_helper_types'
import { OrmaSchema } from '../schema/schema_types'

export type OrmaMutation<Schema extends OrmaSchema> =
    | {
          readonly [Entity in GetAllEntities<Schema>]?: readonly MutationRecord<
              Schema,
              Entity,
              // we only need to do this on the top level, since after the highest entity everything will have an operation,
              // either directly provided or through cascading from the highest entity
              true
          >[]
      }
    | ({
          readonly [Entity in GetAllEntities<Schema>]?: readonly MutationRecord<
              Schema,
              Entity,
              false
          >[]
      } & {
          readonly $operation?: Operation
      })

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
              readonly $operation: Operation
          }
        : {
              readonly $operation?: Operation
          }

type Operation = 'create' | 'update' | 'delete'

type FieldsObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    readonly // baseline for regular props
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
> =
    // handles the case where there are no edges and AllEdges is 'never'
    AllEdges extends never
        ? {}
        : AllEdges extends GetAllEdges<Schema, Entity>
        ? {
              readonly [Field in AllEdges['to_entity']]?: readonly MutationRecord<
                  Schema,
                  Field,
                  false
              >[]
          }
        : never

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

type T = FieldType<GlobalTestSchema, 'post_has_categories', 'main_category'>
