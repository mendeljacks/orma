import { describe, test } from 'mocha'
import { OrmaSchema } from '../types/schema/schema_types'
import { get_schema_diff } from './schema_macro'
import { expect } from 'chai'
import { AlterStatement } from '../types/schema/schema_ast_types'
import { AsyncDatabase } from 'promised-sqlite3'
import { json_to_sql } from '../query/json_sql'
import {
    promised_sqlite3_adapter,
    sqlite3_adapter,
} from '../helpers/database_adapters'
import { orma_mutate } from '../mutate/mutate'
import { generate_orma_schema_cache } from './introspector'

describe.only('schema_macro.ts', () => {
    describe(get_schema_diff.name, () => {
        test('adds fields to entity', async () => {
            const original_schema = {
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

            const final_schema: OrmaSchema = {
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

            const result = get_schema_diff(original_schema, final_schema)
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

            const db = await AsyncDatabase.open(':memory:')
            const statements1 = get_schema_diff(
                { $entities: {} },
                original_schema
            ).map(ast => ({
                sql_string: json_to_sql(ast, 'sqlite'),
            }))
            await promised_sqlite3_adapter(db)(statements1)

            const statements2 = result.map(ast => ({
                sql_string: json_to_sql(ast, 'sqlite'),
            }))
            await promised_sqlite3_adapter(db)(statements2)

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
                    $entities: final_schema.$entities,
                    $cache: generate_orma_schema_cache(final_schema.$entities),
                }
            )
        })
    })
    test('orders adding new foreign keys to existing entities')
})
