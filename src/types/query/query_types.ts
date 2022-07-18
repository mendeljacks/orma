import { OrmaSchema } from '../../introspector/introspector'
import {
    DeepReadonly,
    GetAllEdges,
    GetAllEntities,
    GetFields,
} from '../schema_types'

/*
This is basically broken because of a typescript bug (as usual). Here is the code to reproduce:

type MyType<Obj> = {
  [K in keyof Obj]: { b?: true }
}

const as_t = <T extends MyType<T>>(arg: T) => arg
const t = as_t({
  a: {
    // no intellisense here, but typescript knowns that only b: true is allowed...
    // removinfg the ? from b?: in the type definition causes intellisense to work again
  }
})


*/


export type OrmaQuery<
    Schema extends OrmaSchema,
    Query extends Record<string, any> = Record<string, any>
> = {
    [Key in keyof Query]?: Key extends GetAllEntities<Schema>
        ? Subquery<Schema, Query[Key], Key, false> // known entity
        : Key extends '$where_connected'
        ? WhereConnected<OrmaSchema> // macro
        : Subquery<Schema, Query[Key], GetAllEntities<Schema>, false> // renamed entity
} & {
    // this doesnt do anything, its just there for intellisense
    [Key in GetAllEntities<Schema>]?: unknown
}

export type WhereConnected<Schema extends OrmaSchema> = WhereConnectedMapped<
    Schema,
    GetAllEntities<Schema>
>

// have to uselessly break this function into two because typescript is annoying
type WhereConnectedMapped<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>
> = Entities extends any
    ? {
          $entity: Entities
          $field: GetFields<Schema, Entities>
          $values: (string | number)[]
      }[]
    : never

export type Subquery<
    Schema extends OrmaSchema,
    Query extends Record<string, any>,
    Entities extends GetAllEntities<Schema>,
    RequireFrom extends boolean
> = Entities extends GetAllEntities<Schema>
    ? // this weird way of defining props is a typescript hack to get proper type checking on inferred columns (e.g. id: true
      // is allowed but asdf: true is not since it is not a field name)
      {
          [Key in keyof Query]?: Key extends GetFields<Schema, Entities>
              ? boolean | VirtualField<Schema, Query[Key], Entities> // inferred field
              : Key extends GetAllEdges<Schema, Entities>['to_entity']
              ?
                    | Subquery<Schema, Query[Key], Key, false>
                    | VirtualField<Schema, Query[Key], Entities> // inferred subquery
              : Key extends '$from'
              ? Entities
              : Key extends '$where'
              ? any // TODO: implement where clause types
              : Key extends '$limit' | '$offset'
              ? number
              : Key extends '$group_by'
              ? GroupBy<Schema, Entities>
              : Key extends '$order_by'
              ? OrderBy<Schema, Entities>
              : VirtualField<Schema, Query[Key], Entities>
          // this bit gets us intellisense, since typescript doesnt recognise the hacky way the real type definitions
          // are implemented
      } & { [Field in GetFields<Schema, Entities>]?: any } & {
          [Field in GetAllEdges<Schema, Entities>['to_entity']]?: any
      } & {
          $where?: any
          $limit?: any
          $offset?: any
          $group_by?: any
          $order_by?: any
          // handle requiring $from if an entity name cannot be inferred
      } & (RequireFrom extends true ? { $from: any } : { $from?: any })
    : never

// export type FieldObj<
//     Schema extends OrmaSchema,
//     Entity extends GetAllEntities<Schema>
// > = {
//     [Field in GetFields<Schema, Entity>]?: QueryField<Schema, Entity>
// }

// export type SubqueryObj<
//     Schema extends OrmaSchema,
//     Entity extends GetAllEntities<Schema>
// > = {
//     [SubEntity in Pluck<GetAllEdges<Schema, Entity>, 'to_entity'>]?: Subquery<
//         Schema,
//         SubEntity,
//         false
//     >
// }

// export type VirtualFieldObj<
//     Schema extends OrmaSchema,
//     Entity extends GetAllEntities<Schema>
// > = {
//     [VirtualFieldName in string]?: VirtualField<Schema, Entity>
// }

export type VirtualField<
    Schema extends OrmaSchema,
    NextQuery extends Record<string, any>,
    Entity extends GetAllEntities<Schema>
> =
    | Subquery<
          Schema,
          NextQuery,
          GetAllEdges<Schema, Entity>['to_entity'],
          false
      >
    | Expression<Schema, Entity> // sql functions or renamed field
    | any[] // TODO: replace this with a proper type for a $where clause. any[] is just for $eq: [] clauses

// export type FromObj<
//     Schema extends OrmaSchema,
//     Entity extends GetAllEntities<Schema>,
//     RequireFrom extends boolean
// > = RequireFrom extends true
//     ? {
//           $from: Entity
//       }
//     : {
//           $from?: Entity
//       }

// export type QueryField<
//     Schema extends OrmaSchema,
//     Entity extends GetAllEntities<Schema>
// > = boolean | GetFields<Schema, Entity> | Expression<Schema, Entity>

export type Expression<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> =
    | {
          $sum: Expression<Schema, Entity>
      }
    | {
          $min: Expression<Schema, Entity>
      }
    | {
          $max: Expression<Schema, Entity>
      }
    | {
          $coalesce: Expression<Schema, Entity>
      }
    | GetFields<Schema, Entity>

// export type PaginationObj = {
//     $limit?: number
//     $offset?: number
// }

// any entity name
// export type GroupByObj<
//     Schema extends OrmaSchema,
//     Entity extends GetAllEntities<Schema>
// > = {
//     $group_by?: GroupBy<Schema, Entity>
// }

type FieldOrString<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = GetFields<Schema, Entity> | (string & {})

type GroupBy<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = readonly (FieldOrString<Schema, Entity> | Expression<Schema, Entity>)[]

export type OrderByObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    $order_by?: OrderBy<Schema, Entity>
}

type OrderBy<Schema extends OrmaSchema, Entity extends GetAllEntities<Schema>> =
    // using readonly allows us to do as const in the as_orma_query wrapper function which is needed to do
    // type narrowing (for some reason types arent narrowing with both schema and query params)
    readonly (
        | FieldOrString<Schema, Entity>
        | Expression<Schema, Entity>
        | { $asc: FieldOrString<Schema, Entity> | Expression<Schema, Entity> }
        | { $desc: FieldOrString<Schema, Entity> | Expression<Schema, Entity> }
    )[]
