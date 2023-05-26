import { OrmaSchema } from '../../types/schema/schema_types'
import { Pluck } from '../helper_types'
import {
    GetAllEdges,
    GetAllEntities,
    GetFields,
} from '../schema/schema_helper_types'

export type QueryAliases<Schema extends OrmaSchema> = {
    [Entity in GetAllEntities<Schema>]?: string
} & { $root?: string }

export type OrmaQuery<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>
> = {
    readonly [Entity in GetAllEntities<Schema>]?: OrmaSubquery<
        Schema,
        Aliases,
        Entity
    >
} & {
    readonly [Entity in GetRootAliases<Schema, Aliases>]?: AliasedSubquery<
        Schema,
        Aliases,
        GetAllEntities<Schema>
    >
} & { readonly $where_connected?: WhereConnected<Schema> }

export type WhereConnected<Schema extends OrmaSchema> = WhereConnectedMapped<
    Schema,
    GetAllEntities<Schema>
>

// have to uselessly break this function into two because typescript is annoying
type WhereConnectedMapped<
    Schema extends OrmaSchema,
    Entities extends GetAllEntities<Schema>
> = Entities extends GetAllEntities<Schema>
    ? readonly {
          readonly $entity: Entities
          readonly $field: GetFields<Schema, Entities>
          readonly $values: readonly (string | number)[]
      }[]
    : never

type AliasedSubquery<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entities extends GetAllEntities<Schema>
> = Entities extends GetAllEntities<Schema>
    ? OrmaSubquery<Schema, Aliases, Entities> & {
          readonly $from: Entities
      }
    : never

export type OrmaSubquery<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = FieldObj<Schema, Aliases, Entity> &
    SelectObj<Schema, Aliases, Entity> &
    SubqueryObj<Schema, Aliases, Entity> &
    AliasObj<Schema, Aliases, Entity> &
    FromObj<Schema, Entity> &
    PaginationObj &
    GroupByObj<Schema, Aliases, Entity> &
    OrderByObj<Schema, Aliases, Entity> & { $where?: any; having?: any }

export type SelectObj<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = {
    readonly $select?: readonly (
        | GetFields<Schema, Entity>
        | {
              $as: [
                  GetFields<Schema, Entity>,
                  (
                      | GetFields<Schema, Entity>
                      | GetAliases<Schema, Aliases, Entity>
                  )
              ]
          }
    )[]
}

export type FieldObj<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = {
    readonly [Field in GetFields<Schema, Entity>]?: QueryField<
        Schema,
        Aliases,
        Entity
    >
}

type AliasObj<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = {
    readonly [Field in GetAliases<Schema, Aliases, Entity>]?:
        | QueryAliasedField<Schema, Aliases, Entity>
        | AliasedSubquery<Schema, Aliases, GetAllEntities<Schema>>
}

export type GetRootAliases<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>
> = Aliases['$root'] extends string ? Aliases['$root'] : never

export type GetAliases<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = Entity extends keyof Aliases
    ? Aliases[Entity] extends string
        ? Aliases[Entity]
        : never
    : never

export type GetSubqueryProps<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = Pluck<GetAllEdges<Schema, Entity>, 'to_entity'>

export type SubqueryObj<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = {
    readonly [SubEntity in GetSubqueryProps<Schema, Entity>]?: OrmaSubquery<
        Schema,
        Aliases,
        SubEntity
    >
}

export type FromObj<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    readonly $from?: Entity
}

export type QueryField<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = boolean | Expression<Schema, Aliases, Entity>

type QueryAliasedField<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = Expression<Schema, Aliases, Entity>

export type Expression<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> =
    | {
          readonly $sum: Expression<Schema, Aliases, Entity>
      }
    | {
          readonly $min: Expression<Schema, Aliases, Entity>
      }
    | {
          readonly $max: Expression<Schema, Aliases, Entity>
      }
    | {
          readonly $coalesce: Expression<Schema, Aliases, Entity>
      }
    | GetFields<Schema, Entity>
    | GetAliases<Schema, Aliases, Entity>

export type PaginationObj = {
    readonly $limit?: number
    readonly $offset?: number
}

// any entity name
export type GroupByObj<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = {
    readonly $group_by?: readonly (
        | FieldOrString<Schema, Aliases, Entity>
        | Expression<Schema, Aliases, Entity>
    )[]
}

type FieldOrString<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = GetFields<Schema, Entity> | GetAliases<Schema, Aliases, Entity>

export type OrderByObj<
    Schema extends OrmaSchema,
    Aliases extends QueryAliases<Schema>,
    Entity extends GetAllEntities<Schema>
> = {
    // using readonly allows us to do as const in the as_orma_query wrapper function which is needed to do
    // type narrowing (for some reason types arent narrowing with both schema and query params)
    readonly $order_by?: readonly (
        | Expression<Schema, Aliases, Entity>
        | {
              readonly $asc: Expression<Schema, Aliases, Entity>
          }
        | {
              readonly $desc: Expression<Schema, Aliases, Entity>
          }
    )[]
}

export type SimplifiedQuery<Schema extends OrmaSchema> = {
    readonly [Entity in GetAllEntities<Schema>]?: SimplifiedSubquery<
        Schema,
        Entity
    >
}

export type SimplifiedSubquery<
    Schema extends OrmaSchema,
    Entity extends GetAllEntities<Schema>
> = {
    readonly [Field in GetFields<Schema, Entity>]?: true
} & {
    readonly [NestedEntity in GetAllEdges<
        Schema,
        Entity
    >['to_entity']]?: SimplifiedSubquery<Schema, NestedEntity>
}
