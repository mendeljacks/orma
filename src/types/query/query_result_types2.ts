import { OrmaSchema } from '../../types/schema/schema_types'
import {
    GetAllEntities,
    GetFields,
    GetFieldType,
} from '../schema/schema_helper_types'
import {
    GetAliases,
    GetSubqueryProps,
    OrmaQuery,
    QueryAliases,
    OrmaSubquery,
    SubqueryObj,
} from './query_types2'

type SimplifyType<T> = T extends object
    ? { [K in keyof T]: SimplifyType<T[K]> }
    : T

export type OrmaQueryResult<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Query extends OrmaQuery<Schema, Aliases>
> = SimplifyType<QueryResultComplex<Schema, Aliases, Query>>

/**
 * This has a complicated internal representation in the typescript compiler. This means
 *   1. the on-hover tooltip is hard to read
 *   2. can cause the ts compiler to infinitely load when using .map() on a result array.
 * Therefore we simplify the type, which fixes these problems
 */
export type QueryResultComplex<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Query extends OrmaQuery<Schema, Aliases>
> = {
    [Key in keyof Query &
        GetAllEntities<Schema>]?: Query[Key] extends OrmaSubquery<
        Schema,
        Aliases,
        Key
    >
        ? QueryResultRow<Schema, Aliases, Key, Query[Key]>[]
        : never
}

type QueryResultRow<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>,
    Subquery extends SubqueryObj<Schema, Aliases, Entity>
> = {
    [Key in keyof Subquery &
        GetFields<Schema, Entity>]: Subquery[Key] extends true
        ? GetFieldType<Schema, Entity, Key>
        : Subquery[Key] extends GetFields<Schema, Entity>
        ? GetFieldType<Schema, Entity, Subquery[Key]>
        : any
} & {
    [Key in keyof Subquery &
        GetSubqueryProps<Schema, Entity>]: Subquery[Key] extends OrmaSubquery<
        Schema,
        Aliases,
        Key
    >
        ? QueryResultRow<Schema, Aliases, Key, Subquery[Key]>[]
        : never
} & {
    [Key in keyof Subquery &
        GetAliases<Schema, Aliases, Entity>]: Subquery[Key] extends GetFields<
        Schema,
        Entity
    >
        ? GetFieldType<Schema, Entity, Subquery[Key]>
        : any
}
