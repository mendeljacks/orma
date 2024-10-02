import { RegularCreateTable } from '../compiler/data_definition/create_table/compile_create_table'
import { ColumnDefinition } from '../compiler/data_definition/definitions/compile_column_definition'
import { ForeignKeyDefinition } from '../compiler/data_definition/definitions/compile_foreign_key_definition'
import { IndexDefinition } from '../compiler/data_definition/definitions/compile_index_definition'
import { PrimaryKeyDefintion } from '../compiler/data_definition/definitions/compile_primary_key_definition'
import { UniqueKeyDefinition } from '../compiler/data_definition/definitions/compile_unique_key_definition'
import { Optional } from '../types/helper_types'

export type OrmaSchema = {
    readonly tables: {
        readonly [Key in string]: OrmaTableSchema
    }
    readonly cache?: OrmaSchemaCache
}

type OrmaTableSchema = Omit<
    RegularCreateTable,
    'definitions' | 'create_table' | 'if_not_exists' | 'temporary'
> & {
    readonly database_type: SupportedDatabases
    readonly prepopulate?: Prepopulate
    readonly columns: {
        readonly [column_name in string]: OrmaColumn
    }
    readonly primary_key: OrmaPrimaryKey
    readonly indexes?: readonly OrmaIndex[]
    readonly unique_keys?: readonly OrmaUniqueKey[]
    readonly foreign_keys?: readonly OrmaForeignKey[]
}

export type OrmaColumn = Omit<ColumnDefinition, 'name'>
export type OrmaPrimaryKey = Omit<PrimaryKeyDefintion, 'constraint'>
export type OrmaIndex = Optional<IndexDefinition, 'index'>
export type OrmaForeignKey = Omit<ForeignKeyDefinition, 'constraint'>
export type OrmaUniqueKey = Omit<UniqueKeyDefinition, 'constraint'>

type Prepopulate = {
    supercede: boolean
    rows: readonly Record<string, any>[] // OrmaMutation<Schema>[Table]
}

type OrmaSchemaCache = {
    readonly reversed_foreign_keys: {
        readonly [ReferencedTable in string]: readonly ForeignKeyEdge[]
    }
}

export type ForeignKeyEdge = {
    readonly from_columns: readonly string[]
    readonly to_table: string
    readonly to_columns: readonly string[]
}

export type SupportedDatabases = 'mysql' | 'postgres' | 'sqlite'
