import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../helpers/tests/global_test_schema'
import { apply_nesting_macro } from './nesting_macro'

describe('nesting_macro.ts', () => {
    describe(apply_nesting_macro.name, () => {
        test('handles root nesting', () => {
            const query = {
                posts: {
                    id: true,
                    comments: {
                        id: true,
                        post_id: true,
                    },
                },
            }

            const previous_results = [[['posts'], [{ id: 1 }, { id: 2 }]]]

            apply_nesting_macro(
                query,
                ['posts', 'comments'],
                previous_results,
                global_test_schema
            )

            const goal = {
                posts: {
                    id: true,
                    comments: {
                        id: true,
                        post_id: true,
                        $where: {
                            $in: ['post_id', [1, 2]],
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('handles deep nesting', () => {
            const query = {
                users: {
                    posts: {
                        comments: {
                            id: true,
                        },
                    },
                },
            }

            const previous_results = [[['users'], [{ id: 1 }, { id: 2 }]]]
            apply_nesting_macro(
                query,
                ['users', 'posts', 'comments'],
                previous_results,
                global_test_schema
            )

            const goal = {
                users: {
                    posts: {
                        comments: {
                            id: true,
                            $where: {
                                $in: [
                                    'post_id',
                                    {
                                        $select: ['id'],
                                        $from: 'posts',
                                        $where: {
                                            $in: ['user_id', [1, 2]],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('handles nesting under where clause', () => {
            const query = {
                users: {
                    posts: {
                        // the where clause is on posts, so image_urls will nest based on posts
                        $where: { $gt: ['id', 0] },
                        comments: {},
                    },
                },
            }

            const previous_results = [
                [['users'], [{ id: 1 }, { id: 2 }]],
                [['users', 'posts'], [{ id: 3 }]],
            ]

            apply_nesting_macro(
                query,
                ['users', 'posts', 'comments'],
                previous_results,
                global_test_schema
            )

            const goal = {
                users: {
                    posts: {
                        $where: { $gt: ['id', 0] },
                        comments: {
                            $where: {
                                $in: ['post_id', [3]],
                            },
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('nests based on from clause', () => {
            const query = {
                my_users: {
                    $from: 'users',
                    my_posts: {
                        $from: 'posts',
                        $where: { $gt: ['id', 0] },
                        comments: {},
                    },
                },
            }

            const previous_results = [
                [['my_users'], [{ id: 1 }]],
                [['my_users', 'my_posts'], [{ id: 3 }]],
            ]

            apply_nesting_macro(
                query,
                ['my_users', 'my_posts'],
                previous_results,
                global_test_schema
            )

            apply_nesting_macro(
                query,
                ['my_users', 'my_posts', 'comments'],
                previous_results,
                global_test_schema
            )

            const goal = {
                my_users: {
                    $from: 'users',
                    my_posts: {
                        $from: 'posts',
                        $where: {
                            $and: [
                                {
                                    $gt: ['id', 0],
                                },
                                {
                                    $in: ['user_id', [1]],
                                },
                            ],
                        },
                        comments: {
                            $where: {
                                $in: ['post_id', [3]],
                            },
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('ignores undefined where/having clauses', () => {
            const query = {
                users: {
                    posts: {
                        $where: undefined,
                        $having: undefined,
                        comments: {},
                    },
                },
            }

            const previous_results = [
                [['users'], [{ id: 1 }, { id: 2 }]],
                [['users', 'posts'], [{ id: 3 }]],
            ]
            apply_nesting_macro(
                query,
                ['users', 'posts', 'comments'],
                previous_results,
                global_test_schema
            )

            const goal = {
                users: {
                    posts: {
                        $where: undefined,
                        $having: undefined,
                        comments: {
                            $where: {
                                $in: [
                                    'post_id',
                                    {
                                        $select: ['id'],
                                        $from: 'posts',
                                        $where: {
                                            $in: ['user_id', [1, 2]],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('respects $foreign_key', () => {
            const query = {
                users: {
                    addresses: {
                        $foreign_key: ['billing_address_id'],
                        tax_codes: {
                            id: true,
                        },
                    },
                },
            }

            const previous_results = [
                [
                    ['users'],
                    [{ billing_address_id: 1 }, { billing_address_id: 2 }],
                ],
            ]
            apply_nesting_macro(
                query,
                ['users', 'addresses', 'tax_codes'],
                previous_results,
                global_test_schema
            )

            const goal = {
                users: {
                    addresses: {
                        $foreign_key: ['billing_address_id'],
                        tax_codes: {
                            id: true,
                            $where: {
                                $in: [
                                    'id',
                                    {
                                        $select: ['tax_code_id'],
                                        $from: 'addresses',
                                        $where: {
                                            $in: ['id', [1, 2]],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
    })
})
