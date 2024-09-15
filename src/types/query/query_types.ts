import { sql_function_definitions } from '../../query/ast_to_sql'
import { Pluck } from '../helper_types'
import {
    GetAllEdges,
    GetAllTables,
    GetColumns
} from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'

export type OrmaQueryAliases<Schema extends OrmaSchema> = {
    [Table in GetAllTables<Schema>]?: string
} & { $root?: string }

export type OrmaQuery<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
> = {
    readonly [Table in GetAllTables<Schema>]?: OrmaSubquery<
        Schema,
        Aliases,
        Table
    >
} & {
    readonly [Table in GetRootAliases<Schema, Aliases>]?: OrmaAliasedSubquery<
        Schema,
        Aliases,
        GetAllTables<Schema>
    >
} & { readonly $where_connected?: WhereConnected<Schema> }

export type WhereConnected<Schema extends OrmaSchema> = WhereConnectedMapped<
    Schema,
    GetAllTables<Schema>
>

// have to uselessly break this function into two because typescript is annoying
type WhereConnectedMapped<
    Schema extends OrmaSchema,
    Tables extends GetAllTables<Schema>
> = Tables extends GetAllTables<Schema>
    ? readonly {
          readonly $table: Tables
          readonly $column: GetColumns<Schema, Tables>
          readonly $values: readonly (string | number)[]
      }[]
    : never

export type OrmaAliasedSubquery<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Tables extends GetAllTables<Schema>
> = Tables extends GetAllTables<Schema>
    ? OrmaSubquery<Schema, Aliases, Tables> & {
          readonly $from: Tables
      }
    : never

export type OrmaSubquery<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = ColumnObj<Schema, Aliases, Table> &
    SelectObj<Schema, Aliases, Table> &
    SubqueryObj<Schema, Aliases, Table> &
    AliasObj<Schema, Aliases, Table> &
    FromObj<Schema, Table> &
    PaginationObj &
    ForeignKeyObj &
    GroupByObj<Schema, Aliases, Table> &
    OrderByObj<Schema, Aliases, Table> & {
        readonly $where?: any
        readonly $having?: any
    }

export type SelectObj<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = {
    readonly $select?: readonly (
        | GetColumns<Schema, Table>
        | {
              readonly $as: readonly [
                  GetColumns<Schema, Table> | object,
                  (
                      | GetColumns<Schema, Table>
                      | GetAliases<Schema, Aliases, Table>
                  )
              ]
          }
    )[]
}

export type ColumnObj<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = {
    readonly [Column in GetColumns<Schema, Table>]?: QueryColumn<
        Schema,
        Aliases,
        Table
    >
}

type AliasObj<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = {
    readonly [Column in GetAliases<Schema, Aliases, Table>]?:
        | QueryAliasedColumn<Schema, Aliases, Table>
        | OrmaAliasedSubquery<Schema, Aliases, GetAllTables<Schema>>
}

export type GetRootAliases<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
> = Aliases['$root'] extends string ? Aliases['$root'] : never

export type GetAliases<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = Table extends keyof Aliases
    ? Aliases[Table] extends string
        ? Aliases[Table]
        : never
    : never

export type GetSubqueryProps<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = Pluck<GetAllEdges<Schema, Table>, 'to_table'>

export type SubqueryObj<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = {
    readonly [SubTable in GetSubqueryProps<Schema, Table>]?: OrmaSubquery<
        Schema,
        Aliases,
        SubTable
    >
}

export type FromObj<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = {
    readonly $from?: Table
}

export type QueryColumn<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> =
    | boolean
    | Expression<Schema, Aliases, Table>
    | { $escape: number | string | any[] | Record<string, any> }

type QueryAliasedColumn<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> =
    | Expression<Schema, Aliases, Table>
    | { $escape: number | string | any[] | Record<string, any> }

export type Expression<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> =
    | ExpressionFunction<
          Schema,
          Aliases,
          Table,
          keyof typeof sql_function_definitions
      >
    | GetColumns<Schema, Table>
    | GetAliases<Schema, Aliases, Table>

type ExpressionFunction<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>,
    FunctionNames extends string
> = FunctionNames extends string
    ? {
          [Key in FunctionNames]: Expression<Schema, Aliases, Table>
      }
    : never

export type PaginationObj = {
    readonly $limit?: number
    readonly $offset?: number
}

export type ForeignKeyObj = {
    readonly $foreign_key?: readonly string[]
}

// any table name
export type GroupByObj<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = {
    readonly $group_by?: readonly (
        | ColumnOrString<Schema, Aliases, Table>
        | Expression<Schema, Aliases, Table>
    )[]
}

type ColumnOrString<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = GetColumns<Schema, Table> | GetAliases<Schema, Aliases, Table>

export type OrderByObj<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = {
    // using readonly allows us to do as const in the as_orma_query wrapper function which is needed to do
    // type narrowing (for some reason types arent narrowing with both schema and query params)
    readonly $order_by?: readonly (
        | Expression<Schema, Aliases, Table>
        | {
              readonly $asc: Expression<Schema, Aliases, Table>
          }
        | {
              readonly $desc: Expression<Schema, Aliases, Table>
          }
    )[]
}

export type SimplifiedQuery<Schema extends OrmaSchema> = {
    readonly [Table in GetAllTables<Schema>]?: SimplifiedSubquery<
        Schema,
        Table
    >
}

export type SimplifiedSubquery<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = {
    readonly [Column in GetColumns<Schema, Table>]?: boolean
} & {
    readonly [NestedTable in GetAllEdges<
        Schema,
        Table
    >['to_table']]?: SimplifiedSubquery<Schema, NestedTable>
}
