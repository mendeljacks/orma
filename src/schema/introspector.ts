/**
 * These functions are used to introspect the schema of a mysql database, and from it create a JSON schema compatible with orma.
 * @module
 */

import { writeFileSync } from 'fs'
import { group_by, key_by, sort_by_prop } from '../helpers/helpers'
import { MysqlFunction } from '../mutate/mutate'
import { generate_statement } from '../mutate/statement_generation/mutation_statements'
import { DeepMutable } from '../types/schema/schema_helper_types'
import { OrmaSchema, SupportedDbs } from '../types/schema/schema_types'

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

export const orma_introspect = async (
    db: string,
    mysql_function: MysqlFunction,
    options: { database_type: SupportedDbs }
): Promise<OrmaSchema> => {
    const sql_strings = get_introspect_sqls(db, options.database_type)
    // @ts-ignore
    const [mysql_tables, mysql_columns, mysql_foreign_keys, mysql_indexes]: [
        MysqlTable[],
        MysqlColumn[],
        MysqlForeignKey[],
        MysqlIndex[]
        // @ts-ignore the fact that we dont have the original asts is basically a mistake, since we should not
        // be writing raw sql strings, but there is no strong incentive to fix it, so ts ignore for now
    ] = await mysql_function(sql_strings.map(el => ({ sql_string: el })))

    const transform_keys_to_lower = obj =>
        Object.entries(obj).reduce((acc, val) => {
            acc[val[0].toLowerCase()] = val[1]
            return acc
        }, {})

    const orma_schema = generate_database_schema(
        mysql_tables.map(transform_keys_to_lower) as MysqlTable[],
        mysql_columns.map(transform_keys_to_lower) as MysqlColumn[],
        mysql_foreign_keys.map(transform_keys_to_lower) as MysqlForeignKey[],
        mysql_indexes.map(transform_keys_to_lower) as MysqlIndex[],
        options.database_type
    )

    const $cache = generate_orma_schema_cache(orma_schema.$entities)
    orma_schema.$cache = $cache

    return orma_schema
}

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

/**
 * Takes the results of running the queries from {@link get_introspect_sqls `get_introspect_sqls`} and makes a JSON schema for orma.
 */
export const generate_database_schema = (
    mysql_tables: MysqlTable[],
    mysql_columns: MysqlColumn[],
    mysql_foreign_keys: MysqlForeignKey[],
    mysql_indexes: MysqlIndex[],
    database_type: SupportedDbs
) => {
    const index_schemas = generate_index_schemas(mysql_indexes)
    const mysql_columns_by_table = group_by(mysql_columns, el => el.table_name)
    const mysql_foreign_keys_by_table = group_by(
        mysql_foreign_keys,
        el => el.table_name
    )

    const database_schema = mysql_tables.reduce(
        (acc, mysql_table) => {
            const sorted_mysql_columns = mysql_columns_by_table[
                mysql_table.table_name
            ]
                ?.slice()
                ?.sort((a, b) => a.ordinal_position - b.ordinal_position)

            const sorted_mysql_foreign_keys = mysql_foreign_keys_by_table[
                mysql_table.table_name
            ]
                ?.slice()
                ?.sort((a, b) => sort_by_prop(a, b, 'constraint_name'))

            acc.$entities[mysql_table.table_name] = {
                $comment: mysql_table.table_comment,
                $database_type: database_type,
                $fields: sorted_mysql_columns?.reduce((acc, mysql_column) => {
                    acc[mysql_column.column_name] =
                        generate_field_schema(mysql_column)
                    return acc
                }, {}),
                $primary_key: generate_primary_key_schema(sorted_mysql_columns),
                $foreign_keys: sorted_mysql_foreign_keys?.flatMap(
                    mysql_foreign_key => {
                        const foreign_key =
                            generate_foreign_key_schema(mysql_foreign_key)
                        return foreign_key ? [foreign_key] : []
                    }
                ),
                $indexes: index_schemas[mysql_table.table_name]?.sort((a, b) =>
                    sort_by_prop(a, b, '$name')
                ),
            }

            return acc
        },
        { $entities: {} } as OrmaSchemaMutable
    )

    return database_schema
}

export const generate_field_schema = (mysql_column: MysqlColumn) => {
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

    const enum_match = column_type?.match(/enum\((.+)\)/)?.[1] ?? ''
    const enum_values = enum_match
        .split(',')
        .map((el: any) => el.replaceAll("'", ''))
        .filter(el => el !== '')

    const precision =
        numeric_precision ?? datetime_precision ?? character_maximum_length

    const field_schema: OrmaField = {
        $data_type:
            data_type.toLowerCase() as keyof typeof mysql_to_typescript_types,
        ...(enum_values?.length && { $enum_values: enum_values }),
        ...(precision && { $precision: precision }),
        ...(numeric_scale && { $scale: numeric_scale }),
        ...(column_type?.match(/unsigned/) && { $unsigned: true }),
        ...(extra === 'auto_increment' && { $auto_increment: true }),
        ...((identity_generation || column_default) && {
            $default: identity_generation || column_default,
        }),
        ...(is_nullable === 'NO' && { $not_null: true }),
        ...(column_comment && { $comment: column_comment }),
    }

    return field_schema
}

const generate_primary_key_schema = (mysql_columns: MysqlColumn[]) => {
    const primary_key_columns = mysql_columns.filter(
        el => el.column_key === 'PRI'
    )
    return {
        $fields: primary_key_columns?.map(el => el.column_name) ?? [],
    }
}

const generate_foreign_key_schema = (mysql_foreign_key: MysqlForeignKey) => {
    const {
        table_name,
        column_name,
        referenced_table_name,
        referenced_column_name,
        constraint_name,
    } = mysql_foreign_key

    if (!referenced_table_name || !referenced_column_name) {
        return undefined
    }

    return {
        $name: constraint_name,
        $fields: [column_name],
        $references: {
            $entity: referenced_table_name,
            $fields: [referenced_column_name],
        },
    }
}

export const generate_index_schemas = (mysql_indexes: MysqlIndex[]) => {
    const mysql_indexes_by_table = group_by(
        mysql_indexes,
        index => index.table_name
    )

    const table_names = Object.keys(mysql_indexes_by_table).sort()
    const index_schemas_by_table = table_names.reduce((acc, table_name) => {
        const mysql_indexes = mysql_indexes_by_table[table_name]
            .slice()
            .sort((a, b) => sort_by_prop(a, b, 'index_name'))
            // unique indexes are either a unique constraint or a primary key.
            // both are handled as constraints, not indexes
            .filter(mysql_index => Number(mysql_index.non_unique) === 1)

        // we need to do this because mysql puts each field of an index as a separate row
        // in the indeformation schema table
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
    }, {} as Record<string, OrmaIndex[]>)

    return index_schemas_by_table
}

const generate_index_schema = (mysql_index: MysqlIndex, fields: string[]) => {
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

    const orma_index_schema: OrmaIndex = {
        $name: index_name,
        $fields: fields,
        $index: true, // TODO: figure out how mysql shows other index types like spatial or fulltext
        ...(comment && { $comment: comment }),
        ...(is_visible === 'NO' && { $invisible: true }),
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
            if (!fk_cache[foreign_key.$references.$entity]) {
                fk_cache[foreign_key.$references.$entity] = []
            }
            //@ts-ignore can push
            fk_cache[foreign_key.$references.$entity].push({
                // from_entity: foreign_key.to_entity,
                from_field: foreign_key.$references.$fields[0],
                to_entity: entity,
                to_field: foreign_key.$fields[0],
            })
        })
    })

    return Object.keys(fk_cache).length > 0
        ? {
              $reversed_foreign_keys: fk_cache,
          }
        : undefined
}

type OrmaSchemaMutable = DeepMutable<OrmaSchema>

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
    constraint_name: string
}

type OrmaIndex = NonNullable<
    OrmaSchemaMutable['$entities'][string]['$indexes']
>[number]
type OrmaField = NonNullable<
    OrmaSchemaMutable['$entities'][string]['$fields']
>[string]
type OrmaSchemaCache = NonNullable<OrmaSchemaMutable['$cache']>

export const as_orma_schema = t => t

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
    database_type: SupportedDbs
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