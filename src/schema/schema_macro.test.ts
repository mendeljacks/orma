import { expect } from 'chai'
import { describe, test } from 'mocha'
import { AsyncDatabase } from 'promised-sqlite3'
import { promised_sqlite3_adapter } from '../helpers/database_adapters'
import { orma_mutate } from '../mutate/mutate'
import { json_to_sql } from '../query/json_sql'
import { AlterStatement } from '../types/schema/schema_ast_types'
import { OrmaSchema } from '../types/schema/schema_types'
import { generate_orma_schema_cache, orma_introspect } from './introspector'
import { get_schema_diff } from './schema_macro'
import { open_sqlite_database } from '../integration_tests/integration_test_helpers'

describe.only('schema_macro.ts', () => {
    describe(get_schema_diff.name, () => {
        test('adds fields to existing entity', async () => {
            const old_schema = {
                $entities: {
                    users: {
                        $database_type: 'mysql',
                        $fields: {
                            id: {
                                $data_type: 'int',
                            },
                        },
                        $primary_key: {
                            $fields: ['id'],
                        },
                    },
                },
            } as const satisfies OrmaSchema

            const new_schema: OrmaSchema = {
                $entities: {
                    users: {
                        $database_type: 'mysql',
                        $fields: {
                            id: {
                                $data_type: 'int',
                            },
                            first_name: {
                                $data_type: 'varchar',
                                $not_null: true,
                            },
                            last_name: {
                                $data_type: 'varchar',
                            },
                        },
                        $primary_key: {
                            $fields: ['id'],
                        },
                    },
                },
            } as const satisfies OrmaSchema

            const result = get_schema_diff(old_schema, new_schema)
            const expected: AlterStatement[] = [
                {
                    $alter_table: 'users',
                    $definitions: [
                        {
                            $alter_operation: 'add',
                            $name: 'first_name',
                            $data_type: 'varchar',
                            $not_null: true,
                        },
                    ],
                },
                {
                    $alter_table: 'users',
                    $definitions: [
                        {
                            $alter_operation: 'add',
                            $name: 'last_name',
                            $data_type: 'varchar',
                        },
                    ],
                },
            ]

            expect(result).to.deep.equal(expected)

            const db = await init_memory_database(old_schema, {})
            await update_database_schema(db, new_schema)

            // try to use the new fields
            await orma_mutate(
                {
                    users: {
                        $operation: 'create',
                        id: 1,
                        first_name: 'John',
                        last_name: 'Smith',
                    },
                },
                promised_sqlite3_adapter(db),
                {
                    $entities: new_schema.$entities,
                    $cache: generate_orma_schema_cache(new_schema.$entities),
                }
            )
        })
    })
    test('orders adding new foreign keys to existing entities')
    test.skip(
        'sqlite ignores unsupported schema fields, since they dont show up when introspecting: table comments, enums, precision, scale, constraint name (foreign keys), index comment, is visible'
    )
    test.skip('introspects primary keys for sqlite')
})

const init_memory_database = async (
    orma_schema: OrmaSchema,
    hydration_data: Record<string, any>
) => {
    const db = await AsyncDatabase.open(':memory:')

    const schema_diff = get_schema_diff({ $entities: {} }, orma_schema)
    const statements = schema_diff.map(ast => ({
        sql_string: json_to_sql(ast, 'sqlite'),
    }))
    await promised_sqlite3_adapter(db)(statements)
    await orma_mutate(
        { $operation: 'create', ...hydration_data },
        promised_sqlite3_adapter(db),
        orma_schema
    )

    return db
}

const update_database_schema = async (
    db: Pick<AsyncDatabase, 'all'>,
    new_schema: OrmaSchema
) => {
    const old_schema = await orma_introspect(
        'main',
        promised_sqlite3_adapter(db),
        { database_type: 'sqlite' }
    )
    const result = get_schema_diff(old_schema, new_schema)
    const statements = result.map(ast => ({
        sql_string: json_to_sql(ast, 'sqlite'),
    }))
    await promised_sqlite3_adapter(db)(statements)
}
