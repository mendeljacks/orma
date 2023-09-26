import { SupportedDatabases } from '../types/schema/schema_types'

/**
 * Gets a list of sql strings to collect introspector data for the given database
 * @returns [tables_sql, columns_sql, foreign_keys_sql]
 */
export const get_database_metadata_queries = async (
    database_type: SupportedDatabases,
    schema_name: string
) => {
    if (database_type === 'mysql') {
        return get_introspect_mysql_queries(schema_name)
    }
    if (database_type === 'postgres') {
        return get_introspect_postgres_queries(schema_name)
    }
    if (database_type === 'sqlite') {
        return get_introspect_sqlite_queries(schema_name)
    }

    throw new Error(
        `Introspector does not support databse type '${database_type}'`
    )
}

const get_introspect_postgres_queries = (schema_name: string) => {
    const tables_sql = `
        SELECT * 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE table_schema='${schema_name}'`
    const columns_sql = `
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE table_schema = '${schema_name}' AND table_name IN (
            SELECT table_name 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE table_schema='${schema_name}'
        )`
    const foreign_keys_sql = `
        SELECT
            tc.table_schema, 
            tc.constraint_name, 
            tc.table_name, 
            kcu.column_name, 
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS referenced_table_name,
            ccu.column_name AS referenced_column_name 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND tc.table_schema = '${schema_name}'`
    const indexes_sql = ` 
        SELECT 
            pgc.conname as index_name,
            ccu.table_schema as table_schema,
            0 as non_unique,
            ccu.table_name,
            ccu.column_name,
            contype,
            pg_get_constraintdef(pgc.oid)
        FROM pg_constraint pgc
                JOIN pg_namespace nsp 
                    ON nsp.oid = pgc.connamespace
                JOIN pg_class cls 
                    ON pgc.conrelid = cls.oid
                LEFT JOIN information_schema.constraint_column_usage ccu
                    ON pgc.conname = ccu.constraint_name
                    AND nsp.nspname = ccu.constraint_schema
        WHERE table_schema = '${schema_name}'
        AND contype IN ('p', 'u')
        AND table_name IN (
            SELECT table_name 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE tables.table_schema='${schema_name}'
        )`

    return [tables_sql, columns_sql, foreign_keys_sql, indexes_sql]
}

const get_introspect_mysql_queries = (schema_name: string): string[] => {
    const tables_sql = `
        SELECT * 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE table_schema='${schema_name}'`
    const columns_sql = `
        SELECT * 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE table_schema = '${schema_name}'`
    const foreign_keys_sql = `
        SELECT * 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE REFERENCED_TABLE_SCHEMA = '${schema_name}'`
    const indexes_sql = `
        SELECT * 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = '${schema_name}'`

    return [tables_sql, columns_sql, foreign_keys_sql, indexes_sql]
}

/**
 * @param schema_name Used to refer to attached databases in sqlite. The default of 'main' gives the
 * regular database.
 * @returns
 */
const get_introspect_sqlite_queries = (
    schema_name: string = 'main'
): string[] => {
    // only get actual tables, not views, shadows or virtual tables.
    // sqlite doesn't support table comments
    const tables_sql = `
        SELECT 
            name as table_name
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE table_schema = '${schema_name}' 
            AND type='table'`
    const columns_sql = `
        SELECT 
            table_list.name AS table_name,
            table_info.name AS column_name,
            table_info.cid AS ordinal_position,
            1 - table_info.notnull AS is_nullable,
            table_info.dflt_value AS column_default,
            table_info.type AS data_type,
            iif(table_info.pk = 0, NULL, 'PRI') AS column_key,
            iff(table_info.data_type = 'INTEGER' AND table_info.pk = 1, 'auto_increment', NULL) AS extra
        FROM pragma_table_list() table_list
        INNER JOIN pragma_table_info(table_list.name) table_info
        WHERE table_list.schema = '${schema_name}'`
    const foreign_keys_sql = `
        SELECT 
            table_list.name AS table_name,
            foreign_keys.\`from\` AS column_name,
            foreign_keys.\`table\` AS referenced_table_name,
            foreign_keys.\`to\` AS referenced_column_name
        FROM pragma_table_list() table_list
        INNER JOIN pragma_foreign_key_list(table_list.name) foreign_keys
        WHERE table_list.schema = '${schema_name}'`
    const indexes_sql = `
        SELECT 
            table_list.name AS table_name,
            1 - indexes.unique AS non_unique,
            indexes.name AS index_name,
            index_columns.sqeno AS seq_in_index,
            index_columns.name AS column_name
        FROM pragma_table_list() table_list
        INNER JOIN pragma_index_list(table_list.name) indexes
        INNER JOIN pragma_index_info(indexes.name) index_columns
        WHERE table_list.schema = '${schema_name}'`

    return [tables_sql, columns_sql, foreign_keys_sql, indexes_sql]
}

export type MysqlTable = {
    table_name: string
    table_comment?: string
}

export type MysqlColumn = {
    table_name: string
    column_name: string
    ordinal_position: number
    column_default?: string | number
    is_nullable?: string
    is_identity?: 'YES' | 'NO' // postgres
    identity_generation?: string | null // postgres
    data_type: string
    character_maximum_length?: number
    numeric_precision?: number
    numeric_scale?: number
    column_type?: string
    datetime_precision?: number
    column_key?: 'PRI' | 'UNI' | 'MUL'
    extra?: string
    generation_expression?: string
    column_comment?: string
}

export type MysqlIndex = {
    table_name: string
    non_unique: number | '0'
    index_name: string
    seq_in_index: number
    column_name: string
    collation: 'A' | 'D' | null
    sub_part: number | null
    packed: string | null
    nullable: 'YES' | ''
    index_type: string
    comment: string
    index_comment: string
    is_visible: 'YES' | 'NO'
    expression: string
}

export type MysqlForeignKey = {
    table_name: string
    column_name: string
    referenced_table_name: string
    referenced_column_name: string
    constraint_name?: string
}
