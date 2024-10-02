import { GetAllTables, GetColumns } from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { OrmaQueryAliases } from '../../types/query/query_types'
import { CompilerArgs } from '../compiler'

export const compile_select = ({
    statement,
    path,
    database_type
}: CompilerArgs<Select>) => {}

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

export type Select<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>
> = {
    select: 1
}

type SelectForTable<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> = {
    readonly select: {
        readonly [Column in GetColumns<Schema, Table>]?: QueryColumn<
            Schema,
            Aliases,
            Table
        >
    }
}

type QueryColumn<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> =
    | boolean
    | Expression<Schema, Aliases, Table>
    | { $escape: number | string | any[] | Record<string, any> }
