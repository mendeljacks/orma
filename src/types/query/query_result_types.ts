import {
    DeepMutable,
    GetAllEntities,
    GetFields,
    GetFieldType,
    Keyword,
} from '../schema/schema_helper_types'
import { OrmaSchema } from '../schema/schema_types'

export type OrmaQueryResult<
    Schema extends OrmaSchema,
    Query extends object
> = Omit<
    {
        -readonly [Key in keyof Query]?: Query[Key] extends {
            $from: GetAllEntities<Schema>
        }
            ? OrmaRecord<Schema, Query[Key]['$from'], Query[Key]>[]
            : Query[Key] extends object
            ? Key extends GetAllEntities<Schema>
                ? OrmaRecord<Schema, Key, Query[Key]>[]
                : never
            : never
    },
    Keyword
>

export type OrmaRecord<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Subquery extends object
> = Omit<
    {
        -readonly [Key in keyof Subquery]: Subquery[Key] extends {
            $from: GetAllEntities<Schema>
        }
            ?
                  | OrmaRecord<Schema, Subquery[Key]['$from'], Subquery[Key]>[]
                  | undefined // subquery with $from
            : Subquery[Key] extends true
            ? Key extends GetFields<Schema, Entity>
                ? GetFieldType<Schema, Entity, Key> // field_name: true
                : "Unrecognized field name for value 'true'"
            : Subquery[Key] extends GetFields<Schema, Entity>
            ? GetFieldType<Schema, Entity, Subquery[Key]> // renamed_field: 'field_name'
            : Key extends GetAllEntities<Schema>
            ? Subquery[Key] extends object
                ? OrmaRecord<Schema, Key, Subquery[Key]>[] | undefined // subquery with no $from
                : any
            : Subquery[Key] extends { $escape }
            ? DeepMutable<Subquery[Key]['$escape']>
            : any // unhandled case, like {$sum: 'quantity'}
    },
    Keyword
>

export type OrmaField<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> = GetFieldType<Schema, Entity, Field>
