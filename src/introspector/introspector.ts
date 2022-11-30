/**
 * These functions are used to introspect the schema of a mysql database, and from it create a JSON schema compatible with orma.
 * @module
 */

import { deep_set, group_by } from '../helpers/helpers'
import { Edge, is_reserved_keyword } from '../helpers/schema_helpers'
import { DeepMutable } from '../types/schema_types'

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

export interface mysql_index {
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

export interface mysql_foreign_key {
    table_name: string
    column_name: string
    referenced_table_name: string
    referenced_column_name: string
    constraint_name: string
}

type OrmaSchemaMutable = DeepMutable<OrmaSchema>

export type OrmaSchema = {
    readonly $entities: {
        readonly [entity_name: string]: orma_entity_schema
    }
    $cache?: OrmaSchemaCache
}

export type OrmaSchemaCache = {
    $reversed_foreign_keys: {
        readonly [referenced_entity: string]: readonly ForeignKeyEdge[]
    }
}

export type ForeignKeyEdge = Omit<Edge, 'from_entity'>

export type orma_entity_schema = {
    readonly $database_type: SupportedDbs
    readonly $comment?: string
    readonly $indexes?: readonly orma_index_schema[]
    readonly $foreign_keys?: readonly ForeignKeyEdge[]
    readonly $fields: {
        readonly [field_name: string]: orma_field_schema
    }
}

export type orma_field_schema = {
    readonly data_type?: keyof typeof mysql_to_typescript_types
    readonly character_count?: number
    readonly ordinal_position?: number
    readonly decimal_places?: number
    readonly not_null?: boolean
    readonly primary_key?: boolean
    readonly unsigned?: boolean
    readonly indexed?: boolean
    readonly default?: string | number
    readonly comment?: string
    readonly auto_increment?: boolean
    readonly enum_values?: readonly (string | number)[]
    // readonly references?: {
    //     readonly [referenced_entity: string]: {
    //         readonly [referenced_field: string]: {
    //             readonly [key: string]: never
    //         }
    //     }
    // }
}

export type orma_index_schema = {
    readonly index_name?: string
    readonly is_unique?: boolean
    readonly fields: readonly string[]
    readonly index_type?: string
    readonly invisible?: boolean
    readonly collation?: 'A' | 'D'
    readonly sub_part?: number | null
    readonly packed?: string | null
    readonly extra?: string
    readonly index_comment?: string
    readonly expression?: string
}

export type SupportedDbs = 'mysql' | 'postgres'
/**
 * Gets a list of sql strings to collect introspector data for the given database
 * @returns [tables_sql, columns_sql, foreign_keys_sql]
 */
export const get_introspect_sqls = (
    database_name: string,
    database_type: SupportedDbs
): string[] => {
    /* selects: table_name, table_comment FROM INFORMATION_SCHEMA.TABLES column_name, table_name, data_type, column_type, column_key, is_nullable, numeric_precision, numeric_scale, character_maximum_length, column_default, extra, column_comment FROM information_schema.COLUMNS  table_name, column_name, referenced_table_name, referenced_column_name, constraint_name FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE table_name, non_unique, index_name, seq_in_index, column_name, collation, sub_part, packed, nullable, index_type, comment, index_comment, is_visible, expression FROM INFORMATION_SCHEMA.STATISTICS */

    const tables = `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE table_schema='${database_name}'`
    const columns =
        database_type === 'postgres'
            ? `SELECT * FROM INFORMATION_SCHEMA.COLUMNS  where table_schema = '${database_name}' and table_name in (
        SELECT table_name FROM INFORMATION_SCHEMA.TABLES WHERE table_schema='${database_name}'
        )`
            : `SELECT * FROM INFORMATION_SCHEMA.COLUMNS  WHERE table_schema = '${database_name}'`
    const foreign_keys =
        database_type === 'postgres'
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
            : `SELECT * FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA = '${database_name}'`
    const indexes =
        database_type === 'postgres'
            ? ` 
            select 
            pgc.conname as index_name,
                   ccu.table_schema as table_schema,
                   0 as non_unique,
                   ccu.table_name,
                   ccu.column_name,
                   contype,
                    pg_get_constraintdef(pgc.oid)
            from pg_constraint pgc
                     join pg_namespace nsp on nsp.oid = pgc.connamespace
                     join pg_class  cls on pgc.conrelid = cls.oid
                     left join information_schema.constraint_column_usage ccu
                               on pgc.conname = ccu.constraint_name
                                   and nsp.nspname = ccu.constraint_schema
            where table_schema = '${database_name}'
            and contype in ('p', 'u')
            and table_name in (
            SELECT table_name FROM INFORMATION_SCHEMA.TABLES WHERE tables.table_schema='${database_name}'
            )`
            : `SELECT * FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = '${database_name}'`
    const query_strings = [tables, columns, foreign_keys, indexes]

    return query_strings
}

export const sort_by_prop = <T>(a: T, b: T, prop: keyof T) =>
    // @ts-ignore
    a?.[prop]?.localeCompare(b?.[prop])

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
    mysql_indexes: mysql_index[],
    database_type: SupportedDbs
) => {
    const database_schema: OrmaSchemaMutable = { $entities: {} }

    for (const mysql_table of mysql_tables) {
        database_schema.$entities[mysql_table.table_name] = {
            $comment: mysql_table.table_comment,
            $database_type: database_type,
            $fields: {},
        }
    }

    for (const mysql_column of mysql_columns) {
        const field_schema = generate_field_schema(mysql_column)

        database_schema.$entities[mysql_column.table_name].$fields[
            mysql_column.column_name
        ] = field_schema
    }

    for (const mysql_foreign_key of mysql_foreign_keys) {
        const {
            table_name,
            column_name,
            referenced_table_name,
            referenced_column_name,
            constraint_name,
        } = mysql_foreign_key

        if (!referenced_table_name || !referenced_column_name) {
            continue
        }

        const entity_schema = database_schema.$entities[table_name]
        if (!entity_schema.$foreign_keys) {
            entity_schema.$foreign_keys = []
        }

        entity_schema.$foreign_keys.push({
            from_field: column_name,
            to_entity: referenced_table_name,
            to_field: referenced_column_name,
        })

        entity_schema.$foreign_keys.sort((a, b) =>
            sort_by_prop(a, b, 'from_field')
        )
    }

    const index_schemas = generate_index_schemas(mysql_indexes)
    for (const table_name of Object.keys(index_schemas)) {
        database_schema.$entities[table_name].$indexes = index_schemas[
            table_name
        ].sort((a, b) => sort_by_prop(a, b, 'index_name'))
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
        column_type,
        is_identity,
        datetime_precision,
        column_key,
        extra,
        generation_expression,
        column_comment,
        identity_generation,
    } = mysql_column

    const field_schema: DeepMutable<orma_field_schema> = {
        data_type:
            data_type.toLowerCase() as keyof typeof mysql_to_typescript_types,
        ordinal_position,
    }

    if (data_type === 'enum') {
        // will be like "enum('running','pending','paused')"
        const enum_match = column_type?.match(/enum\((.+)\)/)?.[1] ?? ''
        const enum_values = enum_match
            .split(',')
            .map((el: any) => el.replaceAll("'", ''))
        field_schema.enum_values = enum_values
    }

    if (column_type?.match(/unsigned/)) {
        field_schema.unsigned = true
    }

    // indices
    if (is_nullable === 'NO') {
        field_schema.not_null = true
    }

    if (column_key === 'PRI' || column_key === 'UNI' || column_key === 'MUL') {
        field_schema.indexed = true
    }

    if (column_key === 'PRI' || is_identity === 'YES') {
        field_schema.primary_key = true
    }

    // data constraints
    if (numeric_precision) {
        field_schema.character_count = Number(numeric_precision) ?? 0
    }

    if (character_maximum_length) {
        field_schema.character_count = Number(character_maximum_length) ?? 0
    }

    if (numeric_scale) {
        field_schema.decimal_places = numeric_scale
    }

    if (datetime_precision) {
        field_schema.decimal_places = datetime_precision
    }

    // defaults
    if (identity_generation || column_default) {
        field_schema.default = identity_generation || column_default
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
                const uniq = <T>(els: T[]): T[] => [...new Set(els)]
                const fields = uniq(
                    mysql_indexes_by_name[index_name]
                        .slice()
                        .sort((a, b) => a.seq_in_index - b.seq_in_index)
                        .map(el => el.column_name)
                )
                return generate_index_schema(index, fields)
            }
        )

        acc[table_name] = index_schemas
        return acc
    }, {} as Record<string, DeepMutable<orma_index_schema[]>>)

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

    const orma_index_schema: DeepMutable<orma_index_schema> = {
        index_name,
        is_unique: Number(non_unique) === 0 ? true : false,
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

export const generate_orma_schema_cache = (
    $entities: OrmaSchema['$entities']
): OrmaSchemaCache | undefined => {
    const fk_cache: OrmaSchemaCache['$reversed_foreign_keys'] = {}

    const entities = Object.keys($entities)

    entities.forEach(entity => {
        $entities[entity].$foreign_keys?.forEach(foreign_key => {
            if (!fk_cache[foreign_key.to_entity]) {
                // @ts-ignore we can mutate
                fk_cache[foreign_key.to_entity] = []
            }
            //@ts-ignore can mutate
            fk_cache[foreign_key.to_entity].push({
                // from_entity: foreign_key.to_entity,
                from_field: foreign_key.to_field,
                to_entity: entity,
                to_field: foreign_key.from_field,
            })
        })
    })

    return Object.keys(fk_cache).length > 0
        ? {
              $reversed_foreign_keys: fk_cache,
          }
        : undefined
}

export const orma_introspect = async (
    db: string,
    fn: (s: { sql_string }[]) => Promise<Record<string, unknown>[][]>,
    options: { database_type: 'mysql' | 'postgres' }
): Promise<OrmaSchema> => {
    const sql_strings = get_introspect_sqls(db, options.database_type)
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
        mysql_indexes.map(transform_keys_to_lower) as mysql_index[],
        options.database_type
    )

    const $cache = generate_orma_schema_cache(orma_schema.$entities)
    //@ts-ignore can mutate
    orma_schema.$cache = $cache

    return orma_schema
}
