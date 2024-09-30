import { validate } from '../../common/validator'
import { CompilerArgs } from '../../compiler'
import {
    ColumnDefinition,
    compile_column_definition,
    validate_column_definition
} from './compile_column_definition'
import { compile_data_type } from './compile_data_type'
import {
    compile_foreign_key_definition,
    ForeignKeyDefinition,
    validate_foreign_key_definition
} from './compile_foreign_key_definition'
import {
    compile_index_definition,
    IndexDefinition,
    validate_index_definition
} from './compile_index_definition'
import {
    compile_primary_key_definition,
    PrimaryKeyDefintion,
    validate_primary_key_definition
} from './compile_primary_key_definition'
import {
    compile_unique_key_definition,
    UniqueKeyDefinition,
    validate_unique_key_definition
} from './compile_unique_key_definition'

export const compile_definition = ({
    statement,
    path,
    database_type
}: CompilerArgs<Definition>) => {
    if ('data_type' in statement) {
        return compile_column_definition({ statement, path, database_type })
    }
    if ('index' in statement) {
        return compile_index_definition({ statement, path, database_type })
    }
    if ('constraint' in statement) {
        if (statement.constraint === 'primary_key') {
            return compile_primary_key_definition({
                statement,
                path,
                database_type
            })
        }
        if (statement.constraint === 'unique_key') {
            return compile_unique_key_definition({
                statement,
                path,
                database_type
            })
        }
        if (statement.constraint === 'foreign_key') {
            return compile_foreign_key_definition({
                statement,
                path,
                database_type
            })
        }
    }

    throw new Error('Unrecognised statement type to compile.')
}

export const validate_definition = ({
    statement,
    path,
    database_type
}: CompilerArgs<Definition>) => {
    if ('data_type' in statement) {
        return validate_column_definition({ statement, path, database_type })
    }
    if ('index' in statement) {
        return validate_index_definition({ statement, path, database_type })
    }
    if ('constraint' in statement) {
        if (statement.constraint === 'primary_key') {
            return validate_primary_key_definition({
                statement,
                path,
                database_type
            })
        }
        if (statement.constraint === 'unique_key') {
            return validate_unique_key_definition({
                statement,
                path,
                database_type
            })
        }
        if (statement.constraint === 'foreign_key') {
            return validate_foreign_key_definition({
                statement,
                path,
                database_type
            })
        }
    }

    throw new Error('Unrecognised statement type to validate.')
}

export type Definition =
    | ColumnDefinition
    | IndexDefinition
    | PrimaryKeyDefintion
    | UniqueKeyDefinition
    | ForeignKeyDefinition
