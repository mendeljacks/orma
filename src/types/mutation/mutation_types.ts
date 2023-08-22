import { GlobalTestSchema } from '../../test_data/global_test_schema'
import {
    DeepReadonly,
    GetAllEdges,
    GetAllEntities,
    GetFieldNotNull,
    GetFields,
    GetFieldType,
} from '../schema/schema_helper_types'
import { OrmaSchema } from '../schema/schema_types'

export type OrmaMutation<Schema extends OrmaSchema> = {
    readonly [Entity in GetAllEntities<Schema>]?: readonly MutationRecord<
        Schema,
        Entity
    >[]
} & OperationObj

type MutationRecord<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = FieldsObj<Schema, Entity> &
    OperationObj &
    ForeignKeyFieldsObj<Schema, Entity, GetAllEdges<Schema, Entity>>

type OperationObj = {
    readonly $operation?: Operation
}

type Operation = 'create' | 'update' | 'delete' | 'upsert'

type FieldsObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    // baseline for regular props
    readonly [Field in GetFields<Schema, Entity>]?:
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
                  Field
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
