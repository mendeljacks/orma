/** 
 * These functions are used to introspect the schema of a mysql database, and from it create a JSON schema compatible with orma.
 * @module
*/

import { deep_set } from '../helpers'

export interface mysql_table {
    table_name: string
    table_comment?: string
}

export interface mysql_column {
    table_name: string
    column_name: string
    ordinal_position: number
    column_default?: string | number
    is_nullable?: string
    data_type: string
    character_maximum_length?: number
    numeric_precision?: number
    numeric_scale?: number
    datetime_precision?: number
    column_key?: 'PRI' | 'UNI' | 'MUL'
    extra?: string
    generation_expression?: string
    column_comment?: string
}

export interface mysql_foreign_key {
    table_name: string
    column_name: string
    referenced_table_name: string
    referenced_column_name: string
    constraint_name: string
}

export interface orma_schema {
    entities: {
        [entity_name: string]: {
            comment?: string
            fields: {
                [field_name: string]: orma_field_schema
            }
        }
    }
}

interface orma_field_schema {
    data_type: typeof mysql_to_simple_types[keyof typeof mysql_to_simple_types] // values of mysql_to_simple_types
    ordinal_position: number
    required?: boolean
    primary_key?: boolean
    unique?: boolean
    indexed?: boolean
    character_count?: number
    decimal_places?: number
    default?: string | number
    comment?: string
}

/**
 * Gets a list of sql strings to collect introspector data for the given database
 * @returns [tables_sql, columns_sql, foreign_keys_sql]
 */
export const get_introspect_sqls = (database_name): string[] => {
    const query_strings = [
        `SELECT 
            table_name, 
            table_comment 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE table_schema='${ database_name }'`,

        `SELECT 
            column_name, 
            table_name,
            data_type,
            column_type,
            column_key,
            is_nullable,
            numeric_precision,
            numeric_scale,
            character_maximum_length,
            column_default,
            column_comment
        FROM information_schema.COLUMNS  
        WHERE table_schema = '${ database_name }'`,

        `SELECT 
            table_name, 
            column_name,
            referenced_table_name,
            referenced_column_name,
            constraint_name
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE REFERENCED_TABLE_SCHEMA = '${ database_name }'`
    ]

    return query_strings
}

/**
 * Takes the results of running the queries from {@link get_introspect_sqls `get_introspect_sqls`} and makes a JSON schema for orma.
 * @returns A JSON schema for orma
 * @example const schema = {
 *     entities: {
 *         products: {
 *             comment: 'A list of products',
 *             fields: {
 *                 id: {
 *                     references: {
 *                         vendors: { id: {} }
 *                     },
 *                     required: true,
 *                     indexed: true,
 *                     unique: true,
 *                     primary_key: true
 *                 },
 *                 // ...
 *             },
 *         },
 *        // ...
 *     },
 * }
 */
export const generate_database_schema = (mysql_tables: mysql_table[], mysql_columns: mysql_column[], mysql_foreign_keys: mysql_foreign_key[]) => {


    const database_schema = {
        entities: {}
    }

    for (const mysql_table of mysql_tables) {
        database_schema.entities[mysql_table.table_name] = {
            comment: mysql_table.table_comment,
            fields: {}
        }
    }

    for (const mysql_column of mysql_columns) {
        const field_schema = generate_field_schema(mysql_column)

        database_schema.entities[mysql_column.table_name].fields[mysql_column.column_name] = field_schema
    }

    for (const mysql_foreign_key of mysql_foreign_keys) {
        const {
            table_name,
            column_name,
            referenced_table_name,
            referenced_column_name,
            constraint_name
        } = mysql_foreign_key

        const reference_path = ['entities', table_name, 'fields', column_name, 'references', referenced_table_name, referenced_column_name]
        deep_set(database_schema, reference_path, {})

    }

    return database_schema
}


const mysql_to_simple_types = {
    bigint: "number",
    binary: "string",
    bit: "not_supported",
    blob: "not_supported",
    bool: "boolean",
    boolean: "boolean",
    char: "string",
    date: "data",
    datetime: "data",
    decimal: "number",
    double: "number",
    enum: "enum",
    float: "number",
    int: "number",
    longblob: "not_supported",
    longtext: "string",
    mediumblob: "not_supported",
    mediumint: "number",
    mediumtext: "string",
    set: "not_supported",
    smallint: "number",
    text: "string",
    time: "data",
    timestamp: "data",
    tinyblob: "not_supported",
    tinyint: "boolean",
    tinytext: "string",
    varbinary: "string",
    varchar: "string"
} as const

export const generate_field_schema = (mysql_column: mysql_column) => {

    const {
        table_name,
        column_name,
        ordinal_position,
        column_default,
        is_nullable,
        data_type,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        datetime_precision,
        column_key,
        extra,
        generation_expression,
        column_comment
    } = mysql_column

    const field_schema: orma_field_schema = {
        data_type: mysql_to_simple_types[data_type],
        ordinal_position
    }

    // indices
    if (is_nullable === 'NO') {
        field_schema.required = true
    }

    if (column_key === 'PRI' || column_key === 'UNI' || column_key === 'MUL') {
        field_schema.indexed = true
    }

    if (column_key === 'PRI' || column_key === 'UNI') {
        field_schema.unique = true
    }

    if (column_key === 'PRI') {
        field_schema.primary_key = true
    }

    // data constraints
    if (numeric_precision) {
        field_schema.character_count = numeric_precision
    }

    if (character_maximum_length) {
        field_schema.character_count = character_maximum_length
    }

    if (numeric_scale) {
        field_schema.decimal_places = numeric_scale
    }

    if (datetime_precision) {
        field_schema.decimal_places = datetime_precision
    }

    // defaults
    if (column_default) {
        field_schema.default = column_default
    }

    if (extra === 'auto_increment') {
        field_schema.default = extra
    }

    // comment
    if (column_comment) {
        field_schema.comment = column_comment
    }

    return field_schema
}