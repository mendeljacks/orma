/**
 * These functions are used to introspect the schema of a mysql database, and from it create a JSON schema compatible with orma.
 * @module
 */

import { group_by, sort_by_prop } from '../helpers/helpers'
import { MysqlFunction } from '../mutate/mutate'
import { DeepMutable } from '../types/schema/schema_helper_types'
import { OrmaSchema, SupportedDatabases } from '../types/schema/schema_types'
import {
    MysqlColumn,
    MysqlForeignKey,
    MysqlIndex,
    MysqlTable,
    get_database_metadata_queries,
} from './database_metadata'

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
    schema_name: string,
    mysql_function: MysqlFunction,
    options: { database_type: SupportedDatabases }
): Promise<OrmaSchema> => {
    const queries = get_database_metadata_queries(
        options.database_type,
        schema_name
    )
    const [mysql_tables, mysql_columns, mysql_foreign_keys, mysql_indexes] =
        (await mysql_function(
            // @ts-ignore the fact that we dont have the original asts is basically a mistake, since we should not
            // be writing raw sql strings, but there is no strong incentive to fix it, so ts ignore for now
            queries.map(el => ({ sql_string: el }))
        )) as DatabaseMetadataOutput

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
 * Takes the results of running the queries from {@link get_introspect_sqls `get_introspect_sqls`} and makes a JSON schema for orma.
 */
export const generate_database_schema = (
    mysql_tables: MysqlTable[],
    mysql_columns: MysqlColumn[],
    mysql_foreign_keys: MysqlForeignKey[],
    mysql_indexes: MysqlIndex[],
    database_type: SupportedDatabases
) => {
    const index_schemas = generate_index_schemas(mysql_indexes, false)
    const unique_key_schemas = generate_index_schemas(mysql_indexes, true)
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

            const $fields = sorted_mysql_columns?.reduce(
                (acc, mysql_column) => {
                    acc[mysql_column.column_name] =
                        generate_field_schema(mysql_column)
                    return acc
                },
                {}
            )

            const $foreign_keys = sorted_mysql_foreign_keys?.flatMap(
                mysql_foreign_key => {
                    const foreign_key =
                        generate_foreign_key_schema(mysql_foreign_key)
                    return foreign_key ? [foreign_key] : []
                }
            )

            const $indexes = index_schemas[mysql_table.table_name]?.sort(
                (a, b) => sort_by_prop(a, b, '$name')
            )

            const $unique_keys = unique_key_schemas[
                mysql_table.table_name
            ]?.sort((a, b) => sort_by_prop(a, b, '$name'))

            acc.$entities[mysql_table.table_name] = {
                $comment: mysql_table.table_comment,
                $database_type: database_type,
                $fields,
                $primary_key: generate_primary_key_schema(sorted_mysql_columns),
                ...($foreign_keys?.length && { $foreign_keys }),
                ...($indexes?.length && { $indexes }),
                ...($unique_keys?.length && { $unique_keys }),
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
        $data_type: data_type
            .toLowerCase()
            // sqlite adds a signed indicator, and sometimes calles INT as INTEGER.
            // these replacements make sqlite work similar to mysql
            .replace('unsigned ', '')
            .replace('signed ', '')
            .replace(
                'integer',
                'int'
            ) as keyof typeof mysql_to_typescript_types,
        ...(enum_values?.length && { $enum_values: enum_values }),
        ...(precision && { $precision: precision }),
        ...(numeric_scale && { $scale: numeric_scale }),
        ...(column_type?.match(/unsigned/) && { $unsigned: true }),
        ...(extra === 'auto_increment' && { $auto_increment: true }),
        ...((identity_generation || column_default) && {
            $default:
                identity_generation || parse_column_default(column_default),
        }),
        ...(is_nullable === 'NO' && { $not_null: true }),
        ...(column_comment && { $comment: column_comment }),
    }

    return field_schema
}

const parse_column_default = (value: any) => {
    // Mysql doesnt properly put quotes on their default values, so we need to string parse
    // and handle all the cases. In the Orma schema there should be no ambiguity, even though
    // the mysql information schema does a bad job here

    if (!value) {
        return undefined
    }

    if (value?.toLowerCase?.() === 'current_timestamp') {
        return value
    }

    if (value?.toLowerCase?.() === 'null') {
        return null
    }

    if (!isNaN(Number(value))) {
        return Number(value)
    }

    return `'${value}'`
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

export const generate_index_schemas = (
    mysql_indexes: MysqlIndex[],
    unique_indexes: boolean
) => {
    const mysql_indexes_by_table = group_by(
        mysql_indexes,
        index => index.table_name
    )

    const table_names = Object.keys(mysql_indexes_by_table).sort()
    const index_schemas_by_table = table_names.reduce((acc, table_name) => {
        const mysql_indexes = mysql_indexes_by_table[table_name]
            .slice()
            .sort((a, b) => sort_by_prop(a, b, 'index_name'))
            .filter(mysql_index =>
                unique_indexes
                    ? Number(mysql_index.non_unique) === 0
                    : Number(mysql_index.non_unique) === 1
            )

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
        // $index: true, // TODO: figure out how mysql shows other index types like spatial or fulltext
        ...(index_comment && { $comment: index_comment }),
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

type OrmaIndex = NonNullable<
    OrmaSchemaMutable['$entities'][string]['$indexes']
>[number]

type OrmaField = NonNullable<
    OrmaSchemaMutable['$entities'][string]['$fields']
>[string]

type OrmaSchemaCache = NonNullable<OrmaSchemaMutable['$cache']>

type DatabaseMetadataOutput = [
    MysqlTable[],
    MysqlColumn[],
    MysqlForeignKey[],
    MysqlIndex[]
]
