import { GetAllTables } from '../schema/schema_helper_types'
import { OrmaSchema, SupportedDatabases } from '../schema/schema_types'
import { Path } from '../types'
import { OrmaQueryAliases } from '../types/query/query_types'
import {
    AlterTable,
    compile_alter_table
} from './data_definition/alter_table/compile_alter_table'
import {
    compile_create_table,
    CreateTable
} from './data_definition/create_table/compile_create_table'
import {
    compile_drop_table,
    DropTable
} from './data_definition/drop_table/compile_drop_table'
import {
    compile_truncate_table,
    TruncateTable
} from './data_definition/truncate_table/compile_truncate_table'

export const compile_statement = ({
    statement,
    database_type
}: DDLCompilerArgs<Statement>) => {
    if ('create_table' in statement) {
        return compile_create_table({ statement, database_type })
    }

    if ('alter_table' in statement) {
        return compile_alter_table({ statement, database_type })
    }

    if ('drop_table' in statement) {
        return compile_drop_table({ statement, database_type })
    }

    if ('truncate_table' in statement) {
        return compile_truncate_table({ statement, database_type })
    }

    throw new Error('Unrecognised statement type')
}

export type Statement = CreateTable | AlterTable | DropTable | TruncateTable

export type DDLValidatorArgs<T extends any> = {
    database_type: SupportedDatabases
    path: Path
    statement: T
}
export type DDLCompilerArgs<T extends any> = {
    database_type: SupportedDatabases
    statement: T
}

export type QueryCompilerArgs<
    Schema extends OrmaSchema,
    Statement extends any
> = {
    orma_schema: Schema
    table_name: GetAllTables<Schema>
    statement: Statement
}

export type QueryValidatorArgs<
    Schema extends OrmaSchema,
    Statement extends any
> = {
    orma_schema: Schema
    statement: Statement
    path: Path
    aliases_by_table: { [key in string]: string[] }
}
