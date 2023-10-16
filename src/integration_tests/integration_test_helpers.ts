import { AsyncDatabase } from 'promised-sqlite3'
import { sqlite3_adapter } from '../helpers/database_adapters'
import { remove_file } from '../helpers/file_helpers'
import { get_schema_diff } from '../schema/schema_macro'
import { OrmaSchema } from '../types/schema/schema_types'
import { json_to_sql } from '../query/json_sql'
import { orma_mutate } from '../mutate/mutate'
import { copyFileSync } from 'fs'

const get_db_path = (directory_path: string) =>
    `${directory_path}/testing_database.sqlite`
const get_checkpoint_path = (directory_path: string) =>
    `${directory_path}/testing_database_checkpoint.sqlite`

const clear_database_files = (directory_path: string) => {
    remove_file(get_db_path(directory_path))
    remove_file(get_checkpoint_path(directory_path))
}

/**
 * Call once before all tests run. Make sure the orma_schema entities have $database_type set to 'sqlite'
 */
export const set_up_test_database = async (
    orma_schema: OrmaSchema,
    hydration_data: Record<string, any>,
    directory_path: string
) => {
    clear_database_files(directory_path)
    const db = await AsyncDatabase.open(get_db_path(directory_path))

    const schema_diff = get_schema_diff({ $entities: {} }, orma_schema)
    const statements = schema_diff.map(ast => ({
        sql_string: json_to_sql(ast, 'sqlite'),
    }))
    await sqlite3_adapter(db)(statements)
    await orma_mutate(
        { $operation: 'create', ...hydration_data },
        sqlite3_adapter(db),
        orma_schema
    )
    copyFileSync(
        get_db_path(directory_path),
        get_checkpoint_path(directory_path)
    )

    return db
}

export const tear_down_test_database = async (
    test_database: AsyncDatabase | undefined,
    directory_path: string
) => {
    if (test_database) {
        await test_database.close()
    }
    clear_database_files(directory_path)
}

export const reset_test_database = async (
    test_database: AsyncDatabase | undefined,
    directory_path: string
) => {
    if (test_database) {
        await test_database.close()
    }
    copyFileSync(
        get_checkpoint_path(directory_path),
        get_db_path(directory_path)
    )
    const new_database = await AsyncDatabase.open(get_db_path(directory_path))
    return new_database
}
