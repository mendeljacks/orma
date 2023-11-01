import { OrmaSchema } from '../schema/schema_types'
import {
    DeepMutable,
    GetAllEntities,
    GetFields,
    GetFieldType,
    Keyword,
} from '../schema/schema_helper_types'
import {
    GetAliases,
    GetSubqueryProps,
    OrmaQuery,
    OrmaQueryAliases,
    OrmaSubquery,
    SubqueryObj,
    GetRootAliases,
    OrmaAliasedSubquery,
} from './query_types'

type SimplifyType<T> = T extends object
    ? { [K in keyof T]: SimplifyType<T[K]> }
    : T

// export type OrmaQueryResult<
//     Schema extends OrmaSchema,
//     Aliases extends OrmaQueryAliases<Schema>,
//     Query extends OrmaQuery<Schema, Aliases>
// > = SimplifyType<QueryResultComplex<Schema, Aliases, Query>>

// export type OrmaRecord<
//     Schema extends OrmaSchema,
//     Aliases extends OrmaQueryAliases<Schema>,
//     Entity extends GetAllEntities<Schema>,
//     Subquery extends SubqueryObj<Schema, Aliases, Entity>
// > = SimplifyType<OrmaRecordComplex<Schema, Aliases, Entity, Subquery>>

// /**
//  * This has a complicated internal representation in the typescript compiler. This means
//  *   1. the on-hover tooltip is hard to read
//  *   2. can cause the ts compiler to crash when using .map() in a result (ts 5.0.4, no idea why).
//  * Therefore we simplify the type, which fixes these problems
//  */
// export type QueryResultComplex<
//     Schema extends OrmaSchema,
//     Aliases extends OrmaQueryAliases<Schema>,
//     Query extends OrmaQuery<Schema, Aliases>
// > = {
//     [Key in keyof Query]?: Key extends GetAllEntities<Schema>
//         ? Query[Key] extends OrmaSubquery<Schema, Aliases, Key>
//             ? OrmaRecordComplex<Schema, Aliases, Key, Query[Key]>[]
//             : never
//         : never
// } & {
//     [Key in keyof Query &
//         GetRootAliases<
//             Schema,
//             Aliases
//         >]?: Query[Key] extends OrmaAliasedSubquery<
//         Schema,
//         Aliases,
//         GetAllEntities<Schema>
//     >
//         ? OrmaRecordComplex<Schema, Aliases, Query[Key]['$from'], Query[Key]>[]
//         : never
// }

// type OrmaRecordComplex<
//     Schema extends OrmaSchema,
//     Aliases extends OrmaQueryAliases<Schema>,
//     Entity extends GetAllEntities<Schema>,
//     Subquery extends SubqueryObj<Schema, Aliases, Entity>
// > = {
//     [Key in keyof Subquery &
//         GetFields<Schema, Entity>]: Subquery[Key] extends true
//         ? GetFieldType<Schema, Entity, Key>
//         : Subquery[Key] extends GetFields<Schema, Entity>
//         ? GetFieldType<Schema, Entity, Subquery[Key]>
//         : any
// } & {
//     [Key in keyof Subquery &
//         GetSubqueryProps<Schema, Entity>]?: Subquery[Key] extends OrmaSubquery<
//         Schema,
//         Aliases,
//         Key
//     >
//         ? OrmaRecordComplex<Schema, Aliases, Key, Subquery[Key]>[]
//         : never
// } & {
//     [Key in keyof Subquery &
//         GetAliases<Schema, Aliases, Entity>]: Subquery[Key] extends GetFields<
//         Schema,
//         Entity
//     >
//         ? GetFieldType<Schema, Entity, Subquery[Key]>
//         : Subquery[Key] extends OrmaAliasedSubquery<
//               Schema,
//               Aliases,
//               GetAllEntities<Schema>
//           >
//         ? OrmaRecordComplex<
//               Schema,
//               Aliases,
//               Subquery[Key]['$from'],
//               Subquery[Key]
//           >[]
//         : any
// }

// type SimpleQuery<
//     Schema extends OrmaSchema,
//     Aliases extends OrmaQueryAliases<Schema>
// > = {
//     [Key in GetAllEntities<Schema>]?: SimpleSubquery<Schema, Aliases, Key>
// }

// type SimpleSubquery<
//     Schema extends OrmaSchema,
//     Aliases extends OrmaQueryAliases<Schema>,
//     Entity extends GetAllEntities<Schema>
// > = {
//     [Key in GetFields<Schema, Entity>]?: true
// }

// type SimpleSubquery<
//     Schema extends OrmaSchema,
//     Aliases extends OrmaQueryAliases<Schema>,
//     Entity extends GetAllEntities<Schema>
// > = {}

// ---------------------------------------------------------

// export type OrmaQueryResult<
//     Schema extends OrmaSchema,
//     Aliases extends OrmaQueryAliases<Schema>,
//     Query extends object
// > = SimplifyType<{
//     -readonly [Key in keyof Query &
//         (
//             | GetAllEntities<Schema>
//             | GetRootAliases<Schema, Aliases>
//         )]: Query[Key] extends {
//         $from: GetAllEntities<Schema>
//     }
//         ?
//               | OrmaRecord<Schema, Aliases, Query[Key]['$from'], Query[Key]>[]
//               | undefined
//         : Key extends GetAllEntities<Schema>
//         ? Query[Key] extends object
//             ? OrmaRecord<Schema, Aliases, Key, Query[Key]>[] | undefined
//             : never
//         : never
// }>

export type OrmaQueryResult<
    Schema extends OrmaSchema,
    Query extends object,
    Entity extends GetAllEntities<Schema> = never
> = Omit<
    {
        // should be returned as a result if the key is not a keyword and the value is not a subquery
        -readonly [Key in keyof Query]: Query[Key] extends {
            $from: GetAllEntities<Schema>
        } // if the value has a $from prop, it is always a subquery
            ?
                  | OrmaQueryResult<Schema, Query[Key], Query[Key]['$from']>[]
                  | undefined
            : Query[Key] extends { $escape } // handle escaped constants
            ? DeepMutable<Query[Key]['$escape']>
            : Key extends GetAllEntities<Schema> // The other option for a subquery is that the prop is an entity name
            ? Query[Key] extends object // and the value is an object
                ? Exclude<keyof Query[Key], Keyword> extends never // and the value has at least one non-keyword prop
                    ? never
                    : OrmaQueryResult<Schema, Query[Key], Key>[] | undefined
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

export type OrmaRecord<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>,
    Subquery extends object
> = {
    -readonly [Key in keyof Subquery &
        (
            | GetAllEntities<Schema>
            | GetFields<Schema, Entity>
            | GetAliases<Schema, Aliases, Entity>
        )]: Subquery[Key] extends {
        $from: GetAllEntities<Schema>
    }
        ?
              | OrmaRecord<
                    Schema,
                    Aliases,
                    Subquery[Key]['$from'],
                    Subquery[Key]
                >[]
              | undefined // subquery with $from
        : Subquery[Key] extends { $escape } // handle escaped constants
        ? DeepMutable<Subquery[Key]['$escape']>
        : Subquery[Key] extends true
        ? Key extends GetFields<Schema, Entity>
            ? GetFieldType<Schema, Entity, Key> // field_name: true
            : "Unrecognized field name for value 'true'"
        : Subquery[Key] extends GetFields<Schema, Entity>
        ? GetFieldType<Schema, Entity, Subquery[Key]> // renamed_field: 'field_name'
        : Key extends GetAllEntities<Schema>
        ? Subquery[Key] extends object
            ? OrmaRecord<Schema, Aliases, Key, Subquery[Key]>[] | undefined // subquery with no $from
            : any
        : any // unhandled case, like {$sum: 'quantity'}
}

export type OrmaField<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>,
    Field extends GetFields<Schema, Entity>
> = GetFieldType<Schema, Entity, Field>

// export type OrmaQueryResult<
//     Schema extends OrmaSchema,
//     Aliases extends OrmaQueryAliases<Schema>,
//     Query extends object
// > = Omit<
//     {
//         -readonly [Key in keyof Query]?: Query[Key] extends {
//             $from: GetAllEntities<Schema>
//         }
//             ? OrmaRecord<Schema, Aliases, Query[Key]['$from'], Query[Key]>[]
//             : Query[Key] extends object
//             ? Key extends GetAllEntities<Schema>
//                 ? OrmaRecord<Schema, Aliases, Key, Query[Key]>[]
//                 : never
//             : never
//     },
//     Keyword
// >

// export type OrmaRecord<
//     Schema extends OrmaSchema,
//     Aliases extends OrmaQueryAliases<Schema>,
//     Entity extends GetAllEntities<Schema>,
//     Subquery extends object
// > = Omit<
//     {
//         -readonly [Key in keyof Subquery]: Subquery[Key] extends {
//             $from: GetAllEntities<Schema>
//         }
//             ?
//                   | OrmaRecord<
//                         Schema,
//                         Aliases,
//                         Subquery[Key]['$from'],
//                         Subquery[Key]
//                     >[]
//                   | undefined // subquery with $from
//             : Subquery[Key] extends { $escape }
//             ? DeepMutable<Subquery[Key]['$escape']>
//             : Subquery[Key] extends true
//             ? Key extends GetFields<Schema, Entity>
//                 ? GetFieldType<Schema, Entity, Key> // field_name: true
//                 : "Unrecognized field name for value 'true'"
//             : Subquery[Key] extends GetFields<Schema, Entity>
//             ? GetFieldType<Schema, Entity, Subquery[Key]> // renamed_field: 'field_name'
//             : Key extends GetAllEntities<Schema>
//             ? Subquery[Key] extends object
//                 ? OrmaRecord<Schema, Aliases, Key, Subquery[Key]>[] | undefined // subquery with no $from
//                 : any
//             : any // unhandled case, like {$sum: 'quantity'}
//     },
//     Keyword
// >

/*

Subquery[Key] extends { $escape }
        ? Subquery[Key]['$escape']
*/
