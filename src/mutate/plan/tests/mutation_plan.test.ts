import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../../helpers/tests/global_test_schema'
import {
    get_mutation_plan,
    MutationPlan,
    run_mutation_plan,
} from '../mutation_plan'

describe('mutation_plan.ts', () => {
    describe(get_mutation_plan.name, () => {
        test('handles simple mutation', () => {
            const mutation = {
                users: [
                    {
                        id: { $guid: 1 },
                        $operation: 'create',
                        posts: [
                            {
                                user_id: { $guid: 1 },
                                $operation: 'create',
                            },
                            {
                                user_id: { $guid: 1 },
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            const goal = {
                mutation_pieces: [
                    { record: mutation.users[0], path: ['users', 0] },
                    {
                        record: mutation.users[0].posts[0],
                        path: ['users', 0, 'posts', 0],
                    },
                    {
                        record: mutation.users[0].posts[1],
                        path: ['users', 0, 'posts', 1],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 3 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles foreign keys that are provided by the user', () => {
            const mutation = {
                users: [
                    {
                        $operation: 'create',
                        id: 2,
                        posts: [
                            {
                                user_id: 2,
                                $operation: 'create',
                            },
                        ],
                    },
                ],
                posts: [
                    {
                        $operation: 'create',
                        user_id: 2,
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            const goal = {
                mutation_pieces: [
                    { record: mutation.users[0], path: ['users', 0] },
                    {
                        record: mutation.users[0].posts[0],
                        path: ['users', 0, 'posts', 0],
                    },
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 3 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        // test('respects operation precedence', () => {
        //     const mutation = {
        //         users: [
        //             {
        //                 $operation: 'delete',
        //             },
        //             {
        //                 $operation: 'update',
        //             },
        //             {
        //                 $operation: 'create',
        //             },
        //         ],
        //     }

        //     const mutate_plan = get_mutate_plan(mutation, global_test_schema)

        //     const goal = [
        //         [
        //             {
        //                 operation: 'delete',
        //                 paths: [['users', 0]],
        //                 route: ['users'],
        //             },
        //             {
        //                 operation: 'update',
        //                 paths: [['users', 1]],
        //                 route: ['users'],
        //             },
        //             {
        //                 operation: 'create',
        //                 paths: [['users', 2]],
        //                 route: ['users'],
        //             },
        //         ],
        //     ]

        //     expect(mutate_plan).to.deep.equal(goal)
        // })
        test('respects topological ordering for updated foreign keys', () => {
            const mutation = {
                users: [
                    {
                        id: 2,
                        $operation: 'create',
                    },
                ],
                posts: [
                    {
                        id: 1,
                        user_id: 2,
                        $operation: 'update',
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            const goal = {
                mutation_pieces: [
                    { record: mutation.users[0], path: ['users', 0] },
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 2 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('does regular updates simultaneously', () => {
            const mutation = {
                users: [
                    {
                        id: 2,
                        $operation: 'update',
                    },
                    {
                        id: 3,
                        $operation: 'update',
                    },
                ],
                posts: [
                    {
                        id: 2,
                        $operation: 'update',
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            // update order is not guaranteed
            const goal = {
                mutation_pieces: [
                    { record: mutation.users[0], path: ['users', 0] },
                    { record: mutation.users[1], path: ['users', 1] },
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                ],
                mutation_batches: [{ start_index: 0, end_index: 3 }],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects existing $guids', () => {
            const mutation = {
                users: [
                    {
                        id: { $guid: 2 },
                        $operation: 'create',
                        posts: [
                            {
                                user_id: { $guid: 2 },
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            const goal = {
                mutation_pieces: [
                    { record: mutation.users[0], path: ['users', 0] },
                    {
                        record: mutation.users[0].posts[0],
                        path: ['users', 0, 'posts', 0],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 2 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects topological ordering for delete', () => {
            const mutation = {
                users: [
                    {
                        id: { $guid: 1 },
                        $operation: 'delete',
                        posts: [
                            {
                                user_id: { $guid: 1 },
                                $operation: 'delete',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.users[0].posts[0],
                        path: ['users', 0, 'posts', 0],
                    },
                    { record: mutation.users[0], path: ['users', 0] },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 2 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles mixed operation requests', () => {
            const mutation = {
                users: [
                    {
                        id: 1,
                        $operation: 'update',
                        posts: [
                            {
                                id: 2,
                                $operation: 'delete',
                                comments: [
                                    {
                                        id: 3,
                                        post_id: 2,
                                        $operation: 'delete',
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        id: { $guid: 1 },
                        $operation: 'create',
                        posts: [
                            {
                                user_id: { $guid: 1 },
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            } as const

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.users[0],
                        path: ['users', 0],
                    },
                    {
                        record: mutation.users[0].posts[0].comments[0],
                        path: ['users', 0, 'posts', 0, 'comments', 0],
                    },
                    {
                        record: mutation.users[1],
                        path: ['users', 1],
                    },
                    {
                        record: mutation.users[0].posts[0],
                        path: ['users', 0, 'posts', 0],
                    },
                    {
                        record: mutation.users[1].posts[0],
                        path: ['users', 1, 'posts', 0],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 3 },
                    { start_index: 3, end_index: 5 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles entity with no posts', () => {
            const mutation = {
                users: [
                    {
                        $operation: 'update',
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.users[0],
                        path: ['users', 0],
                    },
                ],
                mutation_batches: [{ start_index: 0, end_index: 1 }],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles reverse nesting', () => {
            const mutation = {
                posts: [
                    {
                        user_id: { $guid: 1 },
                        $operation: 'create',
                        users: [
                            {
                                id: { $guid: 1 },
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.posts[0].users[0],
                        path: ['posts', 0, 'users', 0],
                    },
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 2 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles zigzag nesting', () => {
            const mutation = {
                posts: [
                    {
                        user_id: { $guid: 1 },
                        $operation: 'create',
                        users: [
                            {
                                id: { $guid: 1 },
                                $operation: 'create',
                                posts: [
                                    {
                                        user_id: { $guid: 1 },
                                        $operation: 'create',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.posts[0].users[0],
                        path: ['posts', 0, 'users', 0],
                    },
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                    {
                        record: mutation.posts[0].users[0].posts[0],
                        path: ['posts', 0, 'users', 0, 'posts', 0],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 3 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('set a child foreign key while creating the parent', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'update',
                        id: 1,
                        user_id: { $guid: 1 },
                        users: [
                            {
                                id: { $guid: 1 },
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, global_test_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.posts[0].users[0],
                        path: ['posts', 0, 'users', 0],
                    },
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 2 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
    })
    describe(run_mutation_plan.name, () => {
        test('runs mutation plan', async () => {
            const mutation_plan: MutationPlan = {
                mutation_pieces: [
                    {
                        record: {
                            $operation: 'create',
                            id: 1,
                        },
                        path: ['users', 0],
                    },
                    {
                        record: {
                            $operation: 'create',
                            id: 2,
                        },
                        path: ['users', 1],
                    },
                    {
                        record: {
                            $operation: 'create',
                            id: 3,
                        },
                        path: ['users', 2],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 3 },
                ],
            }

            let i = 0
            await run_mutation_plan(mutation_plan, async context => {
                if (i === 0) {
                    expect(context).to.deep.equal({
                        index: 0,
                        mutation_pieces: [mutation_plan.mutation_pieces[0]],
                        mutation_batch: mutation_plan.mutation_batches[0],
                    })
                } else {
                    expect(context).to.deep.equal({
                        index: 1,
                        mutation_pieces: [
                            mutation_plan.mutation_pieces[1],
                            mutation_plan.mutation_pieces[2],
                        ],
                        mutation_batch: mutation_plan.mutation_batches[1],
                    })
                }
                i += 1
            })
        })
    })
})
