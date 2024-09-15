import { GlobalTestSchema } from '../../test_data/global_test_schema'
import {
    GetAllEdges,
    GetAllTables,
    GetColumns,
    GetColumnNotNull,
    GetColumnType
} from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'

export type OrmaMutation<Schema extends OrmaSchema> = {
    readonly [Table in GetAllTables<Schema>]?: readonly MutationRecord<
        Schema,
        Table
    >[]
} & OperationObj

type MutationRecord<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = ColumnsObj<Schema, Table> &
    OperationObj &
    ForeignKeyColumnsObj<Schema, Table, GetAllEdges<Schema, Table>>

type OperationObj = {
    readonly $operation?: Operation
}

type Operation = 'create' | 'update' | 'delete' | 'upsert' | 'none'

type ColumnsObj<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = {
    // baseline for regular props
    readonly [Column in GetColumns<Schema, Table>]?:
        | ColumnType<Schema, Table, Column>
        // primary or foreign keys can have guids
        | (Column extends GetAllEdges<Schema, Table>['from_column']
              ? { $guid: string | number }
              : never)
}

// & {
//     // required props have to be given
//     [Column in GetColumnsByRequired<Schema, Table, true>]: ColumnType<
//         Schema,
//         Table,
//         Column
//     >
// }

export type ForeignKeyColumnsObj<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    AllEdges extends GetAllEdges<Schema, Table>
> =
    // handles the case where there are no edges and AllEdges is 'never'
    AllEdges extends never
        ? {}
        : AllEdges extends GetAllEdges<Schema, Table>
        ? {
              readonly [Column in AllEdges['to_table']]?: readonly MutationRecord<
                  Schema,
                  Column
              >[]
          }
        : never

export type ColumnType<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Column extends GetColumns<Schema, Table>
> =
    | GetColumnType<Schema, Table, Column> // base type
    // add null to base type only if column is not required
    | NullableColumn<Schema, Table, Column>

type NullableColumn<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Column extends GetColumns<Schema, Table>
> = GetColumnNotNull<Schema, Table, Column> extends true ? never : null //| undefined

type T = ColumnType<GlobalTestSchema, 'post_has_categories', 'main_category'>
