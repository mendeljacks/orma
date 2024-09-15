import { Optional } from '../types/helper_types'
import {
    ColumnDefinition,
    ForeignKeyConstraintDefinition,
    IndexDefinition,
    PrimaryConstraintDefintion,
    RegularCreateStatement,
    UniqueConstraintDefinition
} from '../compiler/schema/schema_ast_types'

export type OrmaSchema = {
    readonly tables: {
        readonly [Key in string]: OrmaTableSchema
    }
    readonly cache?: OrmaSchemaCache
}

type OrmaTableSchema = Omit<
    RegularCreateStatement,
    'definitions' | 'create_table' | 'if_not_exists' | 'temporary'
> & {
    readonly database_type: SupportedDatabases
    readonly prepopulate?: Prepopulate
    readonly columns: {
        readonly [column_name in string]: OrmaColumn
    }
    readonly primary_key: OrmaPrimaryKey
    readonly indeaxes?: readonly OrmaIndex[]
    readonly unique_keys?: readonly OrmaUniqueKey[]
    readonly foreign_keys?: readonly OrmaForeignKey[]
}

export type OrmaColumn = Omit<ColumnDefinition, 'name'>
export type OrmaPrimaryKey = Omit<PrimaryConstraintDefintion, 'constraint'>
export type OrmaIndex = Optional<IndexDefinition, 'index'>
export type OrmaForeignKey = Omit<ForeignKeyConstraintDefinition, 'constraint'>
export type OrmaUniqueKey = Omit<UniqueConstraintDefinition, 'constraint'>

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
