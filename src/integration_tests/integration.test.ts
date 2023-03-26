import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../helpers/helpers'
import { GlobalTestQuery } from '../test_data/global_test_schema'
import { get_mutation_diff } from '../mutate/diff/diff_mutation'
import {
    integration_test_setup,
    test_mutate,
    test_query,
} from './integration_setup.test'

describe('full integration test', () => {
    integration_test_setup()

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
        await test_mutate({
            $operation: 'upsert',
            users: [
                {
                    email: 'aa@a.com',
                    first_name: 'A',
                    likes: [
                        {
                            posts: [
                                {
                                    title: 'First post!',
                                },
                            ],
                        },
                    ],
                },
            ],
        })

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
