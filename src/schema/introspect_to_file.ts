import { writeFileSync } from 'fs'
import { MysqlFunction } from '../mutate/mutate'
import { SupportedDatabases } from '../types/schema/schema_types'
import { orma_introspect } from './introspector'

/**
 *
 * @param database_name Database name or postgres schema name
 * @param output_path The path from the root of project to put generated .ts file
 * @param byo_query_fn a function that takes sqls and executes them
 * @param database_type choose the type of database from supported db
 * @returns
 */
export const introspect_to_file = async (
    database_name: string,
    output_path: string,
    byo_query_fn: MysqlFunction,
    database_type: SupportedDatabases
) => {
    const orma_schema = await orma_introspect(database_name, byo_query_fn, {
        database_type,
    })
    const str = `export const orma_schema = ${JSON.stringify(
        orma_schema,
        null,
        2
    )} as const`
    writeFileSync(output_path, str)
    return orma_schema
}
