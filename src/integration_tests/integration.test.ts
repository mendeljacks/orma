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
    test.skip(
        'updates a post in category without providing both unique keys (gets from nesting in a post)'
    )
    test.skip('handles multiple top level props')
    test.skip('handles manual guid + raw value linking')
    test.skip('handles diamond graph deletes')
    test.skip('handles renesting via id only updates')
    test.skip('handles upsert with linking tables')
    test.skip('allows $identifying_fields override')
})
