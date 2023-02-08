import { OrmaSchema } from '../../types/schema/schema_types'
import {
    GetAllEntities,
    GetFields,
    GetFieldType,
    Keyword,
} from '../schema_helper_types'

export type QueryResult<
    Schema extends OrmaSchema,
    Query extends object,
    Entity extends GetAllEntities<Schema> = never
> = Omit<
    {
        // should be returned as a result if the key is not a keyword and the value is not a subquery
        [Key in keyof Query]: Query[Key] extends { $from: GetAllEntities<Schema> } // if the value has a $from prop, it is always a subquery
            ? QueryResult<Schema, Query[Key], Query[Key]['$from']>[]
            : Key extends GetAllEntities<Schema> // The other option for a subquery is that the prop is an entity name
            ? Query[Key] extends object // and the value is an object
                ? Exclude<keyof Query[Key], Keyword> extends never // and the value has at least one non-keyword prop
                    ? never
                    : QueryResult<Schema, Query[Key], Key>[]
                : never
            : GetSchemaTypeForField<Schema, Entity, Key, Query[Key]>
    },
    Keyword
>

type GetSchemaTypeForField<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Key,
    Value
> = Value extends true
    ? Key extends GetFields<Schema, Entity>
        ? GetFieldType<Schema, Entity, Key>
        : any
    : Value extends GetFields<Schema, Entity>
    ? GetFieldType<Schema, Entity, Value>
    : any
