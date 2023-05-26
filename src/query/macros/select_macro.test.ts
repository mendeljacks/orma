import { expect } from 'chai'
import { describe, test } from 'mocha'
import {
    GlobalTestQuery,
    global_test_schema,
} from '../../test_data/global_test_schema'
import { apply_select_macro } from './select_macro'

describe('select_macro', () => {
    describe(apply_select_macro.name, () => {
        test('handles selects/handles root', () => {
            const query = {
                posts: {
                    id: true,
                    my_title: 'title',
                    total_views: {
                        $sum: 'views',
                    },
                },
            } as const satisfies GlobalTestQuery

            apply_select_macro(query, global_test_schema)

            const goal = {
                posts: {
                    $select: [
                        'id',
                        { $as: ['title', 'my_title'] },
                        { $as: [{ $sum: 'quantity' }, 'total_quantity'] },
                    ],
                    $from: 'posts',
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('handles adding foreign keys', () => {
            const query = {
                posts: {
                    comments: { id: true },
                    users: {},
                },
            } as const satisfies GlobalTestQuery

            apply_select_macro(query, global_test_schema)

            const goal = {
                posts: {
                    $select: ['id', 'user_id'],
                    $from: 'posts',
                    comments: {
                        $select: ['id', 'post_id'],
                        $from: 'comments',
                    },
                    users: {
                        $select: ['id'],
                        $from: 'users',
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('adds foreign keys for renamed subquery', () => {
            const query = {
                posts: {
                    my_comments: {
                        $from: 'comments',
                    },
                },
            } as const satisfies GlobalTestQuery

            apply_select_macro(query, global_test_schema)
            const goal = {
                posts: {
                    $select: ['id'],
                    $from: 'posts',
                    my_comments: {
                        $select: ['post_id'],
                        $from: 'comments',
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test("respects 'from' clause", () => {
            const query = {
                my_posts: {
                    id: true,
                    $from: 'posts',
                },
            } as const satisfies GlobalTestQuery

            apply_select_macro(query, global_test_schema)
            const goal = {
                my_posts: {
                    $select: ['id'],
                    $from: 'posts',
                },
            } as const satisfies GlobalTestQuery

            expect(query).to.deep.equal(goal)
        })
        test('combines with existing $select', () => {
            const query = {
                posts: {
                    id: true,
                    $select: ['title'],
                },
            } as const satisfies GlobalTestQuery

            apply_select_macro(query, global_test_schema)
            const goal = {
                posts: {
                    $from: 'posts',
                    $select: ['title', 'id'],
                },
            }

            expect(query).to.deep.equal(goal)
        })
    })
})
