import { stat } from 'fs'
import { OrmaError } from '../helpers/error_handling'
import { SupportedDatabases } from '../schema/schema_types'
import { Path } from '../types'
import {
    make_validation_error,
    validate_array,
    validate_boolean,
    validate_not_empty,
    validate_number,
    validate_positive_integer,
    validate_string
} from './common/compiler_helpers'
import {
    AlterStatement,
    ColumnDefinition,
    CreateStatement,
    Definition,
    DropStatement,
    TruncateStatement
} from './schema/schema_ast_types'
import { mysql_types } from '../schema/introspector'

export const compile_statement = (args: CompilerArgs<Statement>) => {
    const { statement, path, database_type } = args

    if ('create_table' in statement) {
        
    }
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

export type Statement =
    | CreateStatement
    | AlterStatement
    | DropStatement
    | TruncateStatement

export type CompilerArgs<T extends any> = {
    statement: T
    path: Path
    database_type: SupportedDatabases
}
