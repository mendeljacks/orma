import { expect } from 'chai'
import { describe, test } from 'mocha'
import { sqlite3_adapter } from '../helpers/database_adapters'
import { clone } from '../helpers/helpers'
import { get_mutation_diff } from '../mutate/diff/diff_mutation'
import { orma_mutate_prepare, orma_mutate_run } from '../mutate/mutate'
import { generate_orma_schema_cache } from '../schema/introspector'
import {
    GlobalTestMutation,
    GlobalTestQuery
} from '../test_data/global_test_schema'
import { OrmaSchema } from '../schema/schema_types'
import {
    register_integration_test,
    test_mutate,
    test_query
} from './integration_setup.test'
import { remove_file } from '../helpers/file_helpers'
import {
    close_sqlite_database,
    open_sqlite_database
} from './integration_test_helpers'

describe('full integration test', () => {
    register_integration_test()

    test('Handles orma schema with no nesting', async () => {
        const mutation = {
            $operation: 'create',
            users: [
                { name: 'John', age: 25 },
                { name: 'Jane', age: 30 }
            ]
        } as {
            $operation: 'create'
            users: {
                name: string
                age: number
                user_id?: number
            }[]
        }

        const $tables: OrmaSchema['tables'] = {
            users: {
                database_type: 'sqlite',
                columns: {
                    user_id: {
                        $data_type: 'int',
                        $auto_increment: true,
                        $not_null: true,
                        $unsigned: true
                    },
                    name: {
                        $data_type: 'varchar',
                        $not_null: true
                    }
                },
                primary_key: {
                    $columns: ['user_id'],
                    $name: 'user_id_pk'
                },
                unique_keys: [{ $columns: ['name'], $name: 'name_uq' }]
            }
        }
        const orma_schema: OrmaSchema = {
            tables: $tables,
            cache: generate_orma_schema_cache($tables)
        }

        const mutation_plan = orma_mutate_prepare(orma_schema, mutation)

        const db_file_name = 'simple_test'
        await remove_file(db_file_name)
        const db = await open_sqlite_database(db_file_name)

        await sqlite3_adapter(db)([
            {
                sql_string:
                    'CREATE TABLE users (user_id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR NOT NULL, age INTEGER)'
            }
        ])
        await orma_mutate_run(orma_schema, sqlite3_adapter(db), mutation_plan)

        await close_sqlite_database(db)
        remove_file(db_file_name)
        expect(mutation.users[0].user_id).to.equal(1)
    })

    test('basic a-z test', async () => {
        const query = {
            $where_connected: [
                {
                    $table: 'users',
                    $column: 'id',
                    $values: [1, 3]
                }
            ],
            users: {
                id: true,
                first_name: true,
                email: true,
                $limit: 5,
                $offset: 0,
                posts: {
                    id: true,
                    title: true,
                    views: true,
                    user_id: true,
                    $where: {
                        $or: [
                            {
                                $lte: ['views', { $escape: 5 }]
                            },
                            {
                                $like: ['title', { $escape: 'First%' }]
                            }
                        ]
                    }
                }
            }
        } as const satisfies GlobalTestQuery

        const original = await test_query(query)

        expect(original).to.deep.equal({
            users: [
                {
                    id: 1,
                    first_name: 'Alice',
                    email: 'aa@a.com',
                    posts: [
                        { id: 1, title: 'First post!', views: 2, user_id: 1 }
                    ]
                },
                {
                    id: 3,
                    first_name: 'Charlie',
                    email: 'char@coal.com',
                    posts: [
                        {
                            id: 3,
                            title: 'How to light a wood stove',
                            views: 0,
                            user_id: 3
                        }
                    ]
                }
            ]
        })
        const modified = clone(original)
        modified!.users![0].posts![0].views = 3

        const mutation_diff = get_mutation_diff(original, modified)

        await test_mutate(mutation_diff)

        const res_after_mutation = await test_query({
            posts: {
                id: true,
                views: true,
                $where: {
                    $eq: ['id', { $escape: 1 }]
                }
            }
        } as const satisfies GlobalTestQuery)

        expect(res_after_mutation).to.deep.equal({
            posts: [
                {
                    id: 1,
                    views: 3
                }
            ]
        })
    })
    test('handles basic upsert', async () => {
        // here a comment is being created based on an existing user email and post title
        const mutation = {
            $operation: 'upsert',
            users: [
                {
                    id: { $guid: 'a' },
                    email: 'aa@a.com',
                    first_name: 'A',
                    likes: [
                        {
                            id: undefined,
                            posts: [
                                {
                                    title: 'First post!',
                                    user_id: { $guid: 'a' }
                                }
                            ]
                        }
                    ]
                }
            ]
        } as const
        await test_mutate(mutation)

        expect(mutation.users[0].likes[0].id).to.not.equal(undefined)

        const result = await test_query({
            users: {
                email: true,
                first_name: true,
                last_name: true,
                $where: {
                    $eq: ['email', { $escape: 'aa@a.com' }]
                },
                likes: {
                    user_id: true,
                    post_id: true,
                    $where: {
                        $eq: ['post_id', { $escape: 1 }]
                    },
                    posts: {
                        title: true
                    }
                }
            }
        })

        expect(result).to.deep.equal({
            users: [
                {
                    email: 'aa@a.com',
                    first_name: 'A', // first name was updated
                    last_name: 'Anderson',
                    likes: [
                        {
                            // new like was added
                            user_id: 1,
                            post_id: 1,
                            posts: [{ title: 'First post!' }]
                        }
                    ]
                }
            ]
        })
    })
    test('update child to point to parent', async () => {
        await test_mutate({
            $operation: 'update',
            users: [
                {
                    id: 1,
                    billing_address_id: { $guid: 'a' },
                    shipping_address_id: { $guid: 'a' },
                    addresses: [
                        {
                            id: { $guid: 'a' },
                            line_1: '123 guid test st',
                            resource_id: '1'
                        }
                    ]
                }
            ]
        })

        const result = await test_query({
            users: {
                id: true,
                billing_address_id: true,
                shipping_address_id: true,
                $where: {
                    $eq: ['id', { $escape: 1 }]
                },
                addresses: {
                    id: true,
                    line_1: true,
                    $foreign_key: ['billing_address_id']
                }
            }
        })

        expect(result).to.deep.equal({
            users: [
                {
                    id: 1,
                    billing_address_id: 1,
                    shipping_address_id: 1,
                    addresses: [
                        {
                            id: 1,
                            line_1: '123 guid test st'
                        }
                    ]
                }
            ]
        })
    })
    test("handles 'diamond' nesting graphs", async () => {
        await test_mutate({
            $operation: 'create',
            users: [
                {
                    id: { $guid: 'a' },
                    email: 'ab@c.com',
                    first_name: 'asd',
                    posts: [
                        {
                            title: 'asd test',
                            likes: [
                                {
                                    user_id: { $guid: 'a' }
                                }
                            ]
                        }
                    ]
                }
            ]
        })

        const query = {
            users: {
                id: true,
                email: true,
                posts: {
                    id: true,
                    title: true,
                    likes: {
                        id: true,
                        user_id: true
                    }
                },
                $where: {
                    $eq: ['email', { $escape: 'ab@c.com' }]
                }
            }
        } as const
        const result = await test_query(query)

        // check that guid linking worked properly
        expect(result?.users?.[0]?.id).to.equal(
            result?.users?.[0]?.posts?.[0]?.likes?.[0]?.user_id
        )

        await test_mutate({
            $operation: 'delete',
            users: result.users
        })

        const result_after_delete = await test_query(query)
        expect(result_after_delete.users?.[0]).to.equal(undefined)
    })
    test('handles multiple top level props', async () => {
        await test_mutate({
            $operation: 'create',
            posts: [
                {
                    title: 'asd test',
                    user_id: 1234
                }
            ],
            users: [
                {
                    id: 1234,
                    email: 'ab@c.com',
                    first_name: 'asd'
                }
            ]
        })

        const query = {
            users: {
                id: true,
                email: true,
                posts: {
                    user_id: true,
                    title: true
                },
                $where: {
                    $eq: ['email', { $escape: 'ab@c.com' }]
                }
            }
        } as const
        const result = await test_query(query)

        // check that guid linking worked properly
        expect(result).to.deep.equal({
            users: [
                {
                    id: 1234,
                    email: 'ab@c.com',
                    posts: [
                        {
                            user_id: 1234,
                            title: 'asd test'
                        }
                    ]
                }
            ]
        })
    })
    test('handles query ownership for nullable columns', async () => {
        await test_mutate({
            $operation: 'create',
            addresses: [
                {
                    id: 12345,
                    line_1: 'ASD TEST'
                }
            ]
        })

        const query = {
            $where_connected: [
                {
                    $table: 'users',
                    $column: 'id',
                    $values: [1]
                }
            ],
            addresses: {
                id: true,
                line_1: true,
                $where: {
                    $eq: ['id', { $escape: 12345 }]
                }
            }
        } as const
        const result = await test_query(query)

        // this address is not connected to anything (e.g. billing_address_id), so it
        // is accessible by all users and should appear in the result
        expect(result).to.deep.equal({
            addresses: [
                {
                    id: 12345,
                    line_1: 'ASD TEST'
                }
            ]
        })
    })
    describe('unique check', () => {
        test('throws unique check errors', async () => {
            await test_mutate({
                $operation: 'create',
                posts: [
                    {
                        id: 12345,
                        title: 'unique title',
                        user_id: 1
                    }
                ]
            })

            try {
                await test_mutate({
                    $operation: 'create',
                    posts: [
                        {
                            id: 1,
                            title: 'unique title'
                        }
                    ]
                })
                expect(undefined).to.equal('Expected an error to be thrown')
            } catch (error) {}
        })
        test('allows setting unique column to itself', async () => {
            await test_mutate({
                $operation: 'create',
                posts: [
                    {
                        id: 12345,
                        title: 'unique title',
                        user_id: 1
                    }
                ]
            })

            await test_mutate({
                $operation: 'update',
                posts: [
                    {
                        id: 12345,
                        title: 'unique title'
                    }
                ]
            })
        })
        test('allows noop updates', async () => {
            await test_mutate({
                $operation: 'create',
                posts: [
                    {
                        id: 12345,
                        title: 'unique title',
                        user_id: 1
                    }
                ]
            })

            await test_mutate({
                $operation: 'update',
                posts: [
                    {
                        id: 12345
                    }
                ]
            })
        })
        test('ignores objects in part of unique key', async () => {
            await test_mutate({
                $operation: 'create',
                users: [
                    {
                        id: 123,
                        first_name: 'a',
                        last_name: 'b',
                        email: 'a@b.com'
                    }
                ],
                posts: [
                    {
                        id: 1231,
                        title: 'unique title',
                        user_id: 123
                    }
                ]
            })

            await test_mutate({
                $operation: 'create',
                users: [
                    {
                        $operation: 'update',
                        id: { $guid: 1 },
                        email: 'a@b.com'
                    }
                ],
                likes: [
                    {
                        $operation: 'create',
                        user_id: { $guid: 1 },
                        post_id: 1231
                    }
                ]
            })
        })
    })
    test('doesnt return empty arrays', async () => {
        const res = await test_query({
            posts: {
                id: true,
                $where: { $eq: [{ $escape: 1 }, { $escape: 2 }] }
            }
        } as const satisfies GlobalTestQuery)

        expect(res.posts).to.equal(undefined)
    })
    test('handles selecting escaped object', async () => {
        const res = await test_query({
            posts: {
                id: {
                    $escape: { $guid: 'a' }
                },
                my_title: {
                    $escape: ['hi']
                },
                total_views: {
                    $escape: 1
                },
                users: {
                    id: true
                },
                $limit: 1
            }
        } as const satisfies GlobalTestQuery)

        expect(res).to.deep.equal({
            posts: [
                {
                    id: { $guid: 'a' },
                    my_title: ['hi'],
                    total_views: 1,
                    users: [
                        {
                            id: 1
                        }
                    ]
                }
            ]
        })
    })
    test('removes intermediate foriegn keys', async () => {
        const res = await test_query({
            users: {
                posts: {
                    title: true,
                    $limit: 1
                },
                $limit: 1
            }
        } as const satisfies GlobalTestQuery)

        //@ts-ignore
        expect(res.users?.[0].id).to.equal(undefined)
        //@ts-ignore
        expect(res.users?.[0].posts?.[0].user_id).to.equal(undefined)
    })
    test('handles mutates with no actions', async () => {
        await test_mutate({
            users: [
                {
                    $operation: 'update',
                    id: 1,
                    posts: [
                        {
                            $operation: 'update'
                        }
                    ]
                }
            ]
        } as const satisfies GlobalTestMutation)

        // test passes if it doesnt crash
    })
    test('handles mutates with empty updates', async () => {
        const res = await test_mutate({
            users: [
                {
                    $operation: 'update',
                    posts: [
                        {
                            $operation: 'update'
                        }
                    ]
                }
            ]
        } as const satisfies GlobalTestMutation)

        // test passes if it doesnt crash
    })
    test.skip('allows $identifying_columns override')
    test.skip('handles manual guid + raw value linking')
    test.skip('handles renesting via id only updates')
})
