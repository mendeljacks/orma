import { writeFileSync } from 'fs'
import { MysqlFunction } from '../mutate/mutate'
import { SupportedDatabases } from './schema_types'
import { orma_introspect } from './introspector'

/**
 *
 * @param database_name Database name or postgres schema name
 * @param output_path The path from the root of project to put generated .ts file
 * @param mysql_function a function that takes orma statements and executes them
 * @param database_type database type
 * @returns
 */
export const introspect_to_file = async (
    database_name: string,
    output_path: string,
    mysql_function: MysqlFunction,
    database_type: SupportedDatabases
) => {
    const orma_schema = await orma_introspect(database_name, mysql_function, {
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
