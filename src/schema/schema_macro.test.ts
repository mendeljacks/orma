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
import {
    global_test_database,
    register_integration_test,
    test_mutate,
} from '../integration_tests/integration_setup.test'
import { global_test_schema } from '../test_data/global_test_schema'
import { OrmaMutation } from '../types/mutation/mutation_types'

describe.only('schema_macro.ts', () => {
    register_integration_test()
    describe(get_schema_diff.name, () => {
        test('adds fields to existing entity', async () => {
            const new_schema = {
                ...global_test_schema,
                $entities: {
                    ...global_test_schema.$entities,
                    users: {
                        ...global_test_schema.$entities.users,
                        $fields: {
                            ...global_test_schema.$entities.users.$fields,
                            age: {
                                $data_type: 'int',
                                $not_null: true,
                            },
                            bio: {
                                $data_type: 'varchar',
                            },
                        },
                        $primary_key: {
                            $fields: ['id'],
                        },
                    },
                },
            } as const satisfies OrmaSchema

            // double check output format
            const schema_diff = get_schema_diff(global_test_schema, new_schema)
            const expected: AlterStatement[] = [
                {
                    $alter_table: 'users',
                    $definitions: [
                        {
                            $alter_operation: 'add',
                            $name: 'age',
                            $data_type: 'int',
                            $not_null: true,
                        },
                    ],
                },
                {
                    $alter_table: 'users',
                    $definitions: [
                        {
                            $alter_operation: 'add',
                            $name: 'bio',
                            $data_type: 'varchar',
                        },
                    ],
                },
            ]
            expect(schema_diff).to.deep.equal(expected)

            // update database to new schema
            const sql_string = json_to_sql(schema_diff, 'sqlite')
            await promised_sqlite3_adapter(global_test_database!.db!)([
                { sql_string },
            ])

            // try to use the new fields
            await test_mutate<OrmaMutation<typeof new_schema>>({
                users: [
                    {
                        $operation: 'create',
                        id: 1,
                        age: 21,
                        bio: 'hi',
                    },
                ],
            })
        })
    })
    test('orders adding new foreign keys to existing entities', () => {})
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
