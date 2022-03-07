import { orma_schema } from '../../introspector/introspector'
import {
    OrmaSchema,
    GetAllEntities,
    GetFields,
    GetFieldSchema,
    FilterFieldsBySchemaProp,
    GetFieldType,
    FieldSchemaPropEq,
} from '../schema_types'

export type OrmaMutation<Schema extends OrmaSchema> = {
    [Entity in GetAllEntities<Schema>]?: MutationRecord<Schema, Entity, any>[]
} & OperationObj

type MutationRecord<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    ParentOperation extends Operation
> = FieldsObj<Schema, Entity> & OperationObj

type OperationObj = {
    $operation: Operation
}

type Operation = 'create' | 'update' | 'delete'

type FieldsObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    // required props have to be specified
    [Field in FilterFieldsBySchemaProp<
        Schema,
        Entity,
        'required',
        true
    >]: FieldType<Schema, Entity, Field>
} & {
    // all other props are optional
    [Field in Exclude<
        GetFields<Schema, Entity>,
        FilterFieldsBySchemaProp<Schema, Entity, 'required', true>
    >]?: FieldType<Schema, Entity, Field>
}

type FieldType<
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
