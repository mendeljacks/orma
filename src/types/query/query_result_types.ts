import {
    GetAllTables,
    GetColumns,
    GetColumnType,
    Keyword
} from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'

export type OrmaQueryResult<
    Schema extends OrmaSchema,
    Query extends object
> = Omit<
    {
        -readonly [Key in keyof Query]?: Query[Key] extends {
            $from: GetAllTables<Schema>
        }
            ? OrmaRecord<Schema, Query[Key]['$from'], Query[Key]>[]
            : Query[Key] extends object
            ? Key extends GetAllTables<Schema>
                ? OrmaRecord<Schema, Key, Query[Key]>[]
                : never
            : never
    },
    Keyword
>

export type OrmaRecord<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Subquery extends object
> = Omit<
    {
        -readonly [Key in keyof Subquery]: Subquery[Key] extends {
            $from: GetAllTables<Schema>
        }
            ?
                  | OrmaRecord<Schema, Subquery[Key]['$from'], Subquery[Key]>[]
                  | undefined // subquery with $from
            : Subquery[Key] extends true
            ? Key extends GetColumns<Schema, Table>
                ? GetColumnType<Schema, Table, Key> // column_name: true
                : "Unrecognized column name for value 'true'"
            : Subquery[Key] extends GetColumns<Schema, Table>
            ? GetColumnType<Schema, Table, Subquery[Key]> // renamed_column: 'column_name'
            : Key extends GetAllTables<Schema>
            ? Subquery[Key] extends object
                ? OrmaRecord<Schema, Key, Subquery[Key]>[] | undefined // subquery with no $from
                : any
            : // : Subquery[Key] extends { $escape }
              // ? DeepMutable<Subquery[Key]['$escape']>
              any // unhandled case, like {$sum: 'quantity'}
    },
    Keyword
>

export type OrmaColumn<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Column extends GetColumns<Schema, Table>
> = GetColumnType<Schema, Table, Column>
