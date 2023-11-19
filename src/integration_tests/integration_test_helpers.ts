import * as sqlite3 from 'sqlite3'
import { sqlite3_adapter } from '../helpers/database_adapters'
import { remove_file } from '../helpers/file_helpers'
import { get_schema_diff } from '../schema/schema_macro'
import { OrmaSchema } from '../types/schema/schema_types'
import { json_to_sql } from '../query/ast_to_sql'
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

export const open_sqlite_database = async (path: string) =>
    new Promise<sqlite3.Database>((accept, reject) => {
        const db = new sqlite3.Database(path, e => (e ? reject(e) : accept(db)))
    })

export const close_sqlite_database = async (db: sqlite3.Database) =>
    new Promise<void>((resolve, reject) =>
        db?.close(err => (err ? reject(err) : resolve()))
    )

/**
 * Call once before all tests run. Make sure the orma_schema entities have $database_type set to 'sqlite'
 */
export const set_up_test_database = async (
    orma_schema: OrmaSchema,
    hydration_data: Record<string, any>,
    directory_path: string
) => {
    clear_database_files(directory_path)
    const db = await open_sqlite_database(get_db_path(directory_path))

    const schema_diff = get_schema_diff({ $entities: {} }, orma_schema)
    const statements = schema_diff.map(ast => ({
        sql_string: json_to_sql(ast, 'sqlite')
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
    test_database: sqlite3.Database | undefined,
    directory_path: string
) => {
    if (test_database) {
        await close_sqlite_database(test_database)
    }
    clear_database_files(directory_path)
}

export const reset_test_database = async (
    test_database: sqlite3.Database | undefined,
    directory_path: string
) => {
    if (test_database) {
        await close_sqlite_database(test_database)
    }
    copyFileSync(
        get_checkpoint_path(directory_path),
        get_db_path(directory_path)
    )
    const new_database = await open_sqlite_database(get_db_path(directory_path))
    return new_database
}
