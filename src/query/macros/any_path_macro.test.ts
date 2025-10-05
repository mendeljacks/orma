import { expect } from 'chai'
import { describe, test } from 'mocha'
import {
    GlobalTestQuery,
    global_test_schema
} from '../../test_data/global_test_schema'
import { apply_any_path_macro } from './any_path_macro'

describe('any_path_macro.ts', () => {
    describe(apply_any_path_macro.name, () => {
        test('multiple any clauses', () => {
            const query = {
                posts: {
                    $where: {
                        $and: [
                            {
                                $any_path: [
                                    ['comments'],
                                    {
                                        $eq: ['id', 1]
                                    }
                                ]
                            },
                            {
                                $any_path: [
                                    ['users'],
                                    {
                                        $eq: ['id', 1]
                                    }
                                ]
                            }
                        ]
                    }
                }
            } as const satisfies GlobalTestQuery

            apply_any_path_macro(query, global_test_schema)

            const goal = {
                posts: {
                    $where: {
                        $and: [
                            {
                                $in: [
                                    'id',
                                    {
                                        $select: ['post_id'],
                                        $from: 'comments',
                                        $where: {
                                            $eq: ['id', 1]
                                        }
                                    }
                                ]
                            },
                            {
                                $in: [
                                    'user_id',
                                    {
                                        $select: ['id'],
                                        $from: 'users',
                                        $where: {
                                            $eq: ['id', 1]
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            }

            expect(query).to.deep.equal(goal)
        })
        test('deep any path', () => {
            const query = {
                users: {
                    $where: {
                        $any_path: [
                            ['posts', 'comments'],
                            {
                                $eq: ['id', 1]
                            }
                        ]
                    }
                }
            }

            apply_any_path_macro(query, global_test_schema)

            const goal = {
                users: {
                    $where: {
                        $in: [
                            'id',
                            {
                                $select: ['user_id'],
                                $from: 'posts',
                                $where: {
                                    $in: [
                                        'id',
                                        {
                                            $select: ['post_id'],
                                            $from: 'comments',
                                            $where: {
                                                $eq: ['id', 1]
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            }

            expect(query).to.deep.equal(goal)
        })
        test('uses special handling for nullable foreign key', () => {
            const query = {
                tax_codes: {
                    $where: {
                        $any_path: [
                            ['addresses'],
                            {
                                $eq: ['id', 1]
                            }
                        ]
                    }
                }
            }

            apply_any_path_macro(query, global_test_schema)

            const goal = {
                tax_codes: {
                    $where: {
                        $in: [
                            'id',
                            {
                                $select: ['tax_code_id'],
                                $from: 'addresses',
                                $where: {
                                    $and: [
                                        {
                                            $not: {
                                                $eq: ['tax_code_id', null]
                                            }
                                        },
                                        {
                                            $eq: ['id', 1]
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            }

            expect(query).to.deep.equal(goal)
        })
        test('nested anys', () => {
            const query = {
                users: {
                    $where: {
                        $any_path: [
                            ['posts'],
                            {
                                $any_path: [
                                    ['comments'],
                                    {
                                        $eq: ['id', 1]
                                    }
                                ]
                            }
                        ]
                    }
                }
            }

            apply_any_path_macro(query, global_test_schema)

            const goal = {
                users: {
                    $where: {
                        $in: [
                            'id',
                            {
                                $select: ['user_id'],
                                $from: 'posts',
                                $where: {
                                    $in: [
                                        'id',
                                        {
                                            $select: ['post_id'],
                                            $from: 'comments',
                                            $where: {
                                                $eq: ['id', 1]
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            }

            expect(query).to.deep.equal(goal)
        })
        test('uses having', () => {
            const query = {
                users: {
                    $having: {
                        $any_path: [
                            ['posts'],
                            {
                                $eq: ['id', 1]
                            }
                        ]
                    }
                }
            }

            apply_any_path_macro(query, global_test_schema)
            const goal = {
                users: {
                    $having: {
                        $in: [
                            'id',
                            {
                                $select: ['user_id'],
                                $from: 'posts',
                                $having: {
                                    $eq: ['id', 1]
                                }
                            }
                        ]
                    }
                }
            }
            expect(query).to.deep.equal(goal)
        })
        test('respects $from', () => {
            const query = {
                my_posts: {
                    $from: 'posts',
                    $where: {
                        $any_path: [
                            ['comments'],
                            {
                                $eq: ['id', 1]
                            }
                        ]
                    }
                }
            }

            apply_any_path_macro(query, global_test_schema)
            const goal = {
                my_posts: {
                    $from: 'posts',
                    $where: {
                        $in: [
                            'id',
                            {
                                $select: ['post_id'],
                                $from: 'comments',
                                $where: {
                                    $eq: ['id', 1]
                                }
                            }
                        ]
                    }
                }
            }
            expect(query).to.deep.equal(goal)
        })
    })
})
