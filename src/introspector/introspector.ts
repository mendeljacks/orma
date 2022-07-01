/**
 * These functions are used to introspect the schema of a mysql database, and from it create a JSON schema compatible with orma.
 * @module
 */

import { deep_set, group_by } from '../helpers/helpers'
import { DeepReadonly } from '../types/schema_types'

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

export interface mysql_index {
    table_name: string
    non_unique: number | 'NO' | 'YES'
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

export interface mysql_foreign_key {
    table_name: string
    column_name: string
    referenced_table_name: string
    referenced_column_name: string
    constraint_name: string
}

export interface OrmaSchemaMutable {
    [entity_name: string]: orma_entity_schema
}

export type OrmaSchema = DeepReadonly<OrmaSchemaMutable>

export interface orma_entity_schema {
    $comment?: string
    $indexes?: orma_index_schema[]
    [field_name: string]: orma_field_schema | orma_index_schema[] | string
}

export interface orma_field_schema {
    data_type?: keyof typeof mysql_to_typescript_types
    character_count?: number | string
    ordinal_position?: number
    decimal_places?: number
    not_null?: boolean
    primary_key?: boolean
    indexed?: boolean
    default?: string | number
    comment?: string
    auto_increment?: boolean
    references?: {
        [referenced_entity: string]: {
            [referenced_field: string]: Record<string, never>
        }
    }
}

export interface orma_index_schema {
    index_name?: string
    is_unique?: boolean
    fields: string[]
    index_type?: string
    invisible?: boolean
    collation?: 'A' | 'D'
    sub_part?: number | null
    packed?: string | null
    extra?: string
    index_comment?: string
    expression?: string
}

type SupportedDbs = 'mysql' | 'postgres'
/**
 * Gets a list of sql strings to collect introspector data for the given database
 * @returns [tables_sql, columns_sql, foreign_keys_sql]
 */
export const get_introspect_sqls = (
    database_name: string,
    db_type: SupportedDbs
): string[] => {
    /* selects: table_name, table_comment FROM INFORMATION_SCHEMA.TABLES column_name, table_name, data_type, column_type, column_key, is_nullable, numeric_precision, numeric_scale, character_maximum_length, column_default, extra, column_comment FROM information_schema.COLUMNS  table_name, column_name, referenced_table_name, referenced_column_name, constraint_name FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE table_name, non_unique, index_name, seq_in_index, column_name, collation, sub_part, packed, nullable, index_type, comment, index_comment, is_visible, expression FROM INFORMATION_SCHEMA.STATISTICS */
    const query_strings = [
        `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE table_schema='${database_name}'`,
        `SELECT * FROM INFORMATION_SCHEMA.COLUMNS  WHERE table_schema = '${database_name}'`,
        db_type === 'postgres'
            ? `SELECT
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
                WHERE tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = '${database_name}'`
            : `SELECT * FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA = '${database_name}'`,
        `SELECT * FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = '${database_name}'`,
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
export const generate_database_schema = (
    mysql_tables: mysql_table[],
    mysql_columns: mysql_column[],
    mysql_foreign_keys: mysql_foreign_key[],
    mysql_indexes: mysql_index[]
) => {
    const database_schema: OrmaSchemaMutable = {}

    for (const mysql_table of mysql_tables) {
        database_schema[mysql_table.table_name] = {
            $comment: mysql_table.table_comment,
        }
    }

    for (const mysql_column of mysql_columns) {
        const field_schema = generate_field_schema(mysql_column)

        database_schema[mysql_column.table_name][mysql_column.column_name] =
            field_schema
    }

    for (const mysql_foreign_key of mysql_foreign_keys) {
        const {
            table_name,
            column_name,
            referenced_table_name,
            referenced_column_name,
            constraint_name,
        } = mysql_foreign_key

        const reference_path = [
            table_name,
            column_name,
            'references',
            referenced_table_name,
            referenced_column_name,
        ]
        if (!referenced_table_name || !referenced_column_name) {
            continue
        }
        deep_set(reference_path, {}, database_schema)
    }

    const index_schemas = generate_index_schemas(mysql_indexes)
    for (const table_name of Object.keys(index_schemas)) {
        database_schema[table_name].$indexes = index_schemas[table_name]
    }

    return database_schema
}

export const mysql_to_typescript_types = {
    bigint: 'number',
    binary: 'string',
    bit: 'not_supported',
    blob: 'not_supported',
    bool: 'boolean',
    boolean: 'boolean',
    char: 'string',
    date: 'string',
    datetime: 'string',
    decimal: 'number',
    double: 'number',
    enum: 'enum',
    float: 'number',
    int: 'number',
    longblob: 'not_supported',
    longtext: 'string',
    mediumblob: 'not_supported',
    mediumint: 'number',
    mediumtext: 'string',
    set: 'not_supported',
    smallint: 'number',
    text: 'string',
    time: 'string',
    timestamp: 'string',
    tinyblob: 'not_supported',
    tinyint: 'boolean',
    tinytext: 'string',
    varbinary: 'string',
    varchar: 'string',
    json: 'string',
} as const

export const as_orma_schema = <Schema extends OrmaSchema>(schema: Schema) =>
    schema

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
        column_comment,
    } = mysql_column

    const field_schema: orma_field_schema = {
        data_type:
            data_type.toLowerCase() as keyof typeof mysql_to_typescript_types,
        ordinal_position,
    }

    // indices
    if (is_nullable === 'NO') {
        field_schema.not_null = true
    }

    if (column_key === 'PRI' || column_key === 'UNI' || column_key === 'MUL') {
        field_schema.indexed = true
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
        field_schema.auto_increment = true
    }

    // comment
    if (column_comment) {
        field_schema.comment = column_comment
    }

    return field_schema
}

export const generate_index_schemas = (mysql_indexes: mysql_index[]) => {
    const mysql_indexes_by_table = group_by(
        mysql_indexes,
        index => index.table_name
    )

    const table_names = Object.keys(mysql_indexes_by_table)
    const index_schemas_by_table = table_names.reduce((acc, table_name) => {
        const mysql_indexes = mysql_indexes_by_table[table_name]
        const mysql_indexes_by_name = group_by(
            mysql_indexes,
            index => index.index_name
        )
        const index_schemas = Object.keys(mysql_indexes_by_name).map(
            index_name => {
                const index = mysql_indexes_by_name[index_name][0]
                const fields = mysql_indexes_by_name[index_name]
                    .slice()
                    .sort((a, b) => a.seq_in_index - b.seq_in_index)
                    .map(el => el.column_name)
                return generate_index_schema(index, fields)
            }
        )

        acc[table_name] = index_schemas
        return acc
    }, {} as Record<string, orma_index_schema[]>)

    return index_schemas_by_table
}

const generate_index_schema = (mysql_index: mysql_index, fields: string[]) => {
    const {
        table_name,
        non_unique,
        index_name,
        seq_in_index,
        column_name,
        collation,
        sub_part,
        packed,
        nullable,
        index_type,
        comment,
        index_comment,
        is_visible,
        expression,
    } = mysql_index

    const orma_index_schema: orma_index_schema = {
        index_name,
        is_unique:
            Number(non_unique) === 0 || non_unique === 'NO' ? true : false,
        fields,
        index_type,
        invisible: is_visible === 'NO',
        ...(collation && { collation }),
        ...(sub_part && { sub_part }),
        ...(packed && { packed }),
        ...(comment && { extra: comment }),
        ...(expression && { expression }),
        ...(index_comment && { index_comment }),
    }

    return orma_index_schema
}

export const orma_introspect = async (
    db: string,
    fn: (s: { sql_string }[]) => Promise<Record<string, unknown>[][]>,
    options: { db_type: 'mysql' | 'postgres' }
): Promise<OrmaSchema> => {
    const sql_strings = get_introspect_sqls(db, options.db_type)
    // @ts-ignore
    const [mysql_tables, mysql_columns, mysql_foreign_keys, mysql_indexes]: [
        mysql_table[],
        mysql_column[],
        mysql_foreign_key[],
        mysql_index[]
    ] = await fn(sql_strings.map(el => ({ sql_string: el })))

    // TODO: to be removed when orma lowercase bug fixed
    const transform_keys_to_lower = obj =>
        Object.entries(obj).reduce((acc, val) => {
            acc[val[0].toLowerCase()] = val[1]
            return acc
        }, {})

    const orma_schema = generate_database_schema(
        mysql_tables.map(transform_keys_to_lower) as mysql_table[],
        mysql_columns.map(transform_keys_to_lower) as mysql_column[],
        mysql_foreign_keys.map(transform_keys_to_lower) as mysql_foreign_key[],
        mysql_indexes.map(transform_keys_to_lower) as mysql_index[]
    )

    return orma_schema
}
