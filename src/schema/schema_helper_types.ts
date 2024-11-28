import { TypescriptTypeByMysqlType } from '../compiler/data_definition/sql_data_types'
import {
    ForeignKeyEdge,
    OrmaColumn,
    OrmaForeignKey,
    OrmaSchema
} from '../schema/schema_types'
import { GlobalTestSchema } from '../test_data/global_test_schema'

export type DeepReadonly<T> = T extends (infer R)[]
    ? readonly DeepReadonly<R>[]
    : T extends Function
    ? T
    : T extends object
    ? {
          readonly [P in keyof T]: DeepReadonly<T[P]>
      }
    : T

export type Keyword = `$${string}`

export type DeepMutable<T> = T extends Function
    ? T
    : T extends object
    ? { -readonly [P in keyof T]: DeepMutable<T[P]> }
    : T

// basic structure

// in theory typescript should know that the key is a string, but im getting cases
// where the schema comes from an inferred type that ts thinks the table can be
// a symbol and Adding intersection with string fixes it. One day typescript might fix
// this issue and this can be removed
export type GetAllTables<Schema extends OrmaSchema> = Extract<
    keyof Schema['tables'],
    string
>

export type GetColumns<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = Extract<keyof Schema['tables'][Table]['columns'], string>

export type GetColumnsRequiredForCreate<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = GetColumnsRequiredForCreate2<Schema, Table, GetColumns<Schema, Table>>

type GetColumnsRequiredForCreate2<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Columns extends GetColumns<Schema, Table>
> = Columns extends GetColumns<Schema, Table>
    ? GetColumnRequiredForCreate<
          Schema['tables'][Table]['columns'][Columns]
      > extends true
        ? Columns
        : never
    : never

export type GetColumnsNotRequiredForCreate<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = GetColumnsNotRequiredForCreate2<Schema, Table, GetColumns<Schema, Table>>

type GetColumnsNotRequiredForCreate2<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Columns extends GetColumns<Schema, Table>
> = Columns extends GetColumns<Schema, Table>
    ? GetColumnRequiredForCreate<
          Schema['tables'][Table]['columns'][Columns]
      > extends false
        ? Columns
        : never
    : never

type GetColumnRequiredForCreate<ColumnSchema extends OrmaColumn> =
    ColumnSchema['not_null'] extends true
        ? // and not auto increment
          ColumnSchema['auto_increment'] extends true
            ? false
            : // and no default
            unknown extends ColumnSchema['default']
            ? true
            : // or default is set to undefined
            ColumnSchema['default'] extends undefined
            ? true
            : false
        : false

type T = GetColumnsRequiredForCreate<GlobalTestSchema, 'posts'>
type T2 = GetColumnsNotRequiredForCreate<GlobalTestSchema, 'posts'>
type T3 = GetColumns<GlobalTestSchema, 'posts'>

export type GetColumnNotNull<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Column extends GetColumns<Schema, Table>
> = Schema['tables'][Table]['columns'][Column]['not_null'] extends true
    ? true
    : false

export type GetConnectedTables<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = GetChildTables<Schema, Table> | GetParentTables<Schema, Table>

type GetChildTables<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = CastToTableName<
    Schema,
    NonNullable<
        Schema['cache']
    >['reversed_foreign_keys'][Table][number]['to_table']
>

type GetParentTables<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = CastToTableName<
    Schema,
    NonNullable<
        Schema['tables'][Table]['foreign_keys']
    >[number]['references']['table']
>

type CastToTableName<
    Schema extends OrmaSchema,
    Table extends string
> = Table extends GetAllTables<Schema> ? Table : never

export type GetAllEdges<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = GetParentEdges<Schema, Table> | GetChildEdges<Schema, Table>

export type GetParentEdges<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = ForeignKeyToEdge<
    Schema,
    Table,
    NonNullable<Schema['tables'][Table]['foreign_keys']>[number]
>

type ForeignKeyToEdge<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    ForeignKeys extends OrmaForeignKey
> = ForeignKeys extends OrmaForeignKey
    ? {
          from_columns: ForeignKeys['columns'] extends readonly GetColumns<
              Schema,
              Table
          >[]
              ? ForeignKeys['columns']
              : never
          // no to_table included for performance reasons, since that is the only one being used by the types
          to_table: ForeignKeys['references']['table'] extends GetAllTables<Schema>
              ? ForeignKeys['references']['table']
              : never
      }
    : never

export type GetChildEdges<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>
> = CacheToEdge<
    Schema,
    Table,
    Table extends keyof NonNullable<Schema['cache']>['reversed_foreign_keys']
        ? NonNullable<Schema['cache']>['reversed_foreign_keys'][Table][number]
        : never
>

type CacheToEdge<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Edges extends ForeignKeyEdge
> = Edges extends ForeignKeyEdge
    ? {
          from_columns: Edges['from_columns'] extends readonly GetColumns<
              Schema,
              Table
          >[]
              ? Edges['from_columns']
              : never
          to_table: Edges['to_table'] extends GetAllTables<Schema>
              ? Edges['to_table']
              : never
      }
    : never

/*
So this type actually used to be split into 3 for readability, but it was causing performance issues
so I uglified it, endowing it with lots of repetition and making it hard to follow. Pretty sure its faster
now though.
*/
export type GetColumnType<
    Schema extends OrmaSchema,
    Table extends GetAllTables<Schema>,
    Column extends GetColumns<Schema, Table>
> = Column extends GetColumns<Schema, Table>
    ? AddNull<
          Schema['tables'][Table]['columns'][Column] extends {
              data_type: 'enum'
              enum_values: readonly any[]
          }
              ? Schema['tables'][Table]['columns'][Column]['enum_values'][number]
              : TypescriptTypeByMysqlType[Schema['tables'][Table]['columns'][Column]['data_type']],
          Schema['tables'][Table]['columns'][Column]['not_null'] extends true
              ? false
              : true
      >
    : never

type AddNull<T, AddNull extends boolean> = AddNull extends true ? T | null : T

// export type GetColumnSchema<
//     Schema extends OrmaSchema,
//     Table extends GetAllTables<Schema>,
//     Column extends GetColumnsForTables<Schema, Table>
// > = Schema['$tables'][Table]['$columns'][Column] extends OrmaColumnSchema
//     ? Schema['$tables'][Table]['$columns'][Column]
//     : any
