import { expect } from 'chai'
import { describe, test } from 'mocha'
import { sqlite3_adapter } from '../helpers/database_adapters'
import { clone } from '../helpers/helpers'
import { get_mutation_diff } from '../mutate/diff/diff_mutation'
import { orma_mutate_prepare, orma_mutate_run } from '../mutate/mutate'
import { generate_orma_schema_cache } from '../schema/introspector'
import { GlobalTestQuery } from '../test_data/global_test_schema'
import { OrmaSchema } from '../types/schema/schema_types'
import {
    close_database,
    integration_test_setup,
    open_database,
    remove_file,
    test_mutate,
    test_query,
} from './integration_setup.test'

describe('full integration test', () => {
    integration_test_setup()

    test('Handles orma schema with no nesting', async () => {
        const mutation = {
            $operation: 'create',
            users: [
                { name: 'John', age: 25 },
                { name: 'Jane', age: 30 },
            ],
        } as {
            $operation: 'create'
            users: {
                name: string
                age: number
                user_id?: number
            }[]
        }

        const $entities: OrmaSchema['$entities'] = {
            users: {
                $database_type: 'sqlite',
                $fields: {
                    user_id: {
                        $data_type: 'int',
                        $auto_increment: true,
                        $not_null: true,
                        $unsigned: true,
                    },
                    name: {
                        $data_type: 'varchar',
                        $not_null: true,
                    },
                },
                $primary_key: {
                    $fields: ['user_id'],
                    $name: 'user_id_pk',
                },
                $unique_keys: [{ $fields: ['name'], $name: 'name_uq' }],
            },
        }
        const orma_schema: OrmaSchema = {
            $entities,
            $cache: generate_orma_schema_cache($entities),
        }

        const mutation_plan = orma_mutate_prepare(orma_schema, mutation)
        const database = { db: undefined, file_name: 'simple_test' }

        await remove_file(database.file_name)
        await open_database(database)

        await sqlite3_adapter(database.db!)([
            {
                sql_string:
                    'CREATE TABLE users (user_id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR NOT NULL, age INTEGER)',
            },
        ])
        await orma_mutate_run(
            orma_schema,
            sqlite3_adapter(database.db!),
            mutation_plan
        )

        await close_database(database)
        await remove_file(database.file_name)
        expect(mutation.users[0].user_id).to.equal(1)
    })

    test('basic a-z test', async () => {
        const query = {
            $where_connected: [
                {
                    $entity: 'users',
                    $field: 'id',
                    $values: [1, 3],
                },
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
                    $where: {
                        $or: [
                            {
                                $lte: ['views', { $escape: 5 }],
                            },
                            {
                                $like: ['title', { $escape: 'First%' }],
                            },
                        ],
                    },
                },
            },
        } as const satisfies GlobalTestQuery

        const original = await test_query(query)

        expect(original).to.deep.equal({
            users: [
                {
                    id: 1,
                    first_name: 'Alice',
                    email: 'aa@a.com',
                    posts: [
                        { id: 1, title: 'First post!', views: 2, user_id: 1 },
                    ],
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
                            user_id: 3,
                        },
                    ],
                },
            ],
        })
        const modified = clone(original)
        modified.users[0].posts[0].views = 3

        const mutation_diff = get_mutation_diff(original, modified)

        await test_mutate(mutation_diff)

        const res_after_mutation = await test_query({
            posts: {
                id: true,
                views: true,
                $where: {
                    $eq: ['id', { $escape: 1 }],
                },
            },
        } as const satisfies GlobalTestQuery)

        expect(res_after_mutation).to.deep.equal({
            posts: [
                {
                    id: 1,
                    views: 3,
                },
            ],
        })
    })
    test('handles basic upsert', async () => {
        // here a comment is being created based on an existing user email and post title
        const mutation = {
            $operation: 'upsert',
            users: [
                {
                    email: 'aa@a.com',
                    first_name: 'A',
                    likes: [
                        {
                            id: undefined,
                            posts: [
                                {
                                    title: 'First post!',
                                },
                            ],
                        },
                    ],
                },
            ],
        } as const
        await test_mutate(mutation)

        expect(mutation.users[0].likes[0].id).to.not.equal(undefined)

        const result = await test_query({
            users: {
                email: true,
                first_name: true,
                last_name: true,
                $where: {
                    $eq: ['email', { $escape: 'aa@a.com' }],
                },
                likes: {
                    user_id: true,
                    post_id: true,
                    $where: {
                        $eq: ['post_id', { $escape: 1 }],
                    },
                    posts: {
                        title: true,
                    },
                },
            },
        })

        expect(result).to.deep.equal({
            users: [
                {
                    email: 'aa@a.com',
                    first_name: 'A', // first name was updated
                    last_name: 'Anderson',
                    id: 1,
                    likes: [
                        {
                            // new like was added
                            user_id: 1,
                            post_id: 1,
                            posts: [{ title: 'First post!', id: 1 }],
                        },
                    ],
                },
            ],
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
                            resource_id: '1',
                        },
                    ],
                },
            ],
        })

        const result = await test_query({
            users: {
                id: true,
                billing_address_id: true,
                shipping_address_id: true,
                $where: {
                    $eq: ['id', { $escape: 1 }],
                },
                addresses: {
                    id: true,
                    line_1: true,
                    $foreign_key: ['billing_address_id'],
                },
            },
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
                            line_1: '123 guid test st',
                        },
                    ],
                },
            ],
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
                                    user_id: { $guid: 'a' },
                                },
                            ],
                        },
                    ],
                },
            ],
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
                        user_id: true,
                    },
                },
                $where: {
                    $eq: ['email', { $escape: 'ab@c.com' }],
                },
            },
        } as const
        const result = await test_query(query)

        // check that guid linking worked properly
        expect(result.users[0].id).to.equal(
            result.users[0].posts[0].likes[0].user_id
        )

        await test_mutate({
            $operation: 'delete',
            users: result.users,
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
                    user_id: 1234,
                },
            ],
            users: [
                {
                    id: 1234,
                    email: 'ab@c.com',
                    first_name: 'asd',
                },
            ],
        })

        const query = {
            users: {
                id: true,
                email: true,
                posts: {
                    user_id: true,
                    title: true,
                },
                $where: {
                    $eq: ['email', { $escape: 'ab@c.com' }],
                },
            },
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
                            title: 'asd test',
                        },
                    ],
                },
            ],
        })
    })
    test.skip('allows $identifying_fields override')
    test.skip('handles manual guid + raw value linking')
    test.skip('handles renesting via id only updates')
})
