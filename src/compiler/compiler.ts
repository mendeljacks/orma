import { SupportedDatabases } from '../schema/schema_types'
import { Path } from '../types'
import { validate_array } from './common/compiler_helpers'
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
    path,
    database_type
}: CompilerArgs<Statement>) => {
    if ('create_table' in statement) {
        return compile_create_table({ statement, path, database_type })
    }

    if ('alter_table' in statement) {
        return compile_alter_table({ statement, path, database_type })
    }

    if ('drop_table' in statement) {
        return compile_drop_table({ statement, path, database_type })
    }

    if ('truncate_table' in statement) {
        return compile_truncate_table({ statement, path, database_type })
    }

    throw new Error('Unrecognised statement type')
}

const compile_definitions = (args: CompilerArgs<Definition[]>) => {
    const { statement, path, database_type } = args

    const sql = statement?.map(definition => {
        if ('data_type' in definition) {
            // column definition
            return {
                sql: `${definition.name} `
            }
        }
    })

    if (!Array.isArray(statement)) {
        return { sql: '', errors: validate_array(statement, path) }
    }
}

export type Statement = CreateTable | AlterTable | DropTable | TruncateTable

export type CompilerArgs<T extends any> = {
    statement: T
    path: Path
    database_type: SupportedDatabases
}
