import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../../test_data/global_test_schema'
import { apply_nesting_mutation_macro } from '../../macros/nesting_mutation_macro'
import {
    get_mutation_plan,
    MutationPiece,
    MutationPlan,
    run_mutation_plan,
} from '../mutation_plan'

describe('mutation_plan.ts', () => {
    describe(get_mutation_plan.name, () => {
        test('handles simple mutation batching', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: { id: { $guid: 1 }, $operation: 'create' },
                    path: ['users', 0],
                },
                {
                    record: { user_id: { $guid: 1 }, $operation: 'create' },
                    path: ['users', 0, 'posts', 0],
                },
                {
                    record: { user_id: { $guid: 1 }, $operation: 'create' },
                    path: ['users', 0, 'posts', 1],
                },
            ]

            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            const goal = {
                mutation_pieces,
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 3 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles foreign keys that are provided by the user', () => {
            const mutation_pieces: MutationPiece[] = [
                { record: { $operation: 'create', id: 2 }, path: ['users', 0] },
                {
                    record: { $operation: 'create', user_id: 2 },
                    path: ['posts', 0],
                },
                {
                    record: { user_id: 2, $operation: 'create' },
                    path: ['users', 0, 'posts', 0],
                },
            ]

            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            const goal = {
                mutation_pieces,
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 3 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects topological ordering for updated foreign keys', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: { id: 1, user_id: 2, $operation: 'update' },
                    path: ['posts', 0],
                },
                { record: { id: 2, $operation: 'create' }, path: ['users', 0] },
            ]
            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            const goal = {
                mutation_pieces: [mutation_pieces[1], mutation_pieces[0]],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 2 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('does regular updates simultaneously', () => {
            const mutation_pieces: MutationPiece[] = [
                { record: { id: 2, $operation: 'update' }, path: ['users', 0] },
                { record: { id: 3, $operation: 'update' }, path: ['users', 1] },
                { record: { id: 2, $operation: 'update' }, path: ['posts', 0] },
            ]
            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            // update order is not guaranteed
            const goal = {
                mutation_pieces,
                mutation_batches: [{ start_index: 0, end_index: 3 }],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects existing $guids', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: { user_id: { $guid: 2 }, $operation: 'create' },
                    path: ['users', 0, 'posts', 0],
                },
                {
                    record: { id: { $guid: 2 }, $operation: 'create' },
                    path: ['users', 0],
                },
            ]

            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            const goal = {
                mutation_pieces: [mutation_pieces[1], mutation_pieces[0]],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 2 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects topological ordering for delete', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: { id: { $guid: 1 }, $operation: 'delete' },
                    path: ['users', 0],
                },
                {
                    record: { user_id: { $guid: 1 }, $operation: 'delete' },
                    path: ['users', 0, 'posts', 0],
                },
            ]
            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            const goal = {
                mutation_pieces: [mutation_pieces[1], mutation_pieces[0]],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 2 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles mixed operation requests', () => {
            const mutation_pieces: MutationPiece[] = [
                { record: { id: 1, $operation: 'update' }, path: ['users', 0] },
                {
                    record: { id: { $guid: 1 }, $operation: 'create' },
                    path: ['users', 1],
                },
                {
                    record: { id: 2, $operation: 'delete' },
                    path: ['users', 0, 'posts', 0],
                },
                {
                    record: { user_id: { $guid: 1 }, $operation: 'create' },
                    path: ['users', 1, 'posts', 0],
                },
                {
                    record: { id: 3, post_id: 2, $operation: 'delete' },
                    path: ['users', 0, 'posts', 0, 'comments', 0],
                },
            ]

            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            const goal = {
                mutation_pieces: [
                    mutation_pieces[0],
                    mutation_pieces[1],
                    mutation_pieces[4],
                    mutation_pieces[3],
                    mutation_pieces[2],
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 3 },
                    { start_index: 3, end_index: 5 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles entity with no nesting', () => {
            const mutation_pieces: MutationPiece[] = [
                { record: { $operation: 'update' }, path: ['users', 0] },
            ]

            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            const goal = {
                mutation_pieces,
                mutation_batches: [{ start_index: 0, end_index: 1 }],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles reverse nesting', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: { user_id: { $guid: 1 }, $operation: 'create' },
                    path: ['posts', 0],
                },
                {
                    record: { id: { $guid: 1 }, $operation: 'create' },
                    path: ['posts', 0, 'users', 0],
                },
            ]

            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            const goal = {
                mutation_pieces: [mutation_pieces[1], mutation_pieces[0]],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 2 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles zigzag nesting', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: { user_id: { $guid: 1 }, $operation: 'create' },
                    path: ['posts', 0],
                },
                {
                    record: { id: { $guid: 1 }, $operation: 'create' },
                    path: ['posts', 0, 'users', 0],
                },
                {
                    record: { user_id: { $guid: 1 }, $operation: 'create' },
                    path: ['posts', 0, 'users', 0, 'posts', 0],
                },
            ]

            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            const goal = {
                mutation_pieces: [
                    mutation_pieces[1],
                    mutation_pieces[0],
                    mutation_pieces[2],
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 3 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('set a child foreign key while creating the parent', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        user_id: { $guid: 1 },
                    },
                    path: ['posts', 0],
                },
                {
                    record: { id: { $guid: 1 }, $operation: 'create' },
                    path: ['posts', 0, 'users', 0],
                },
            ]

            const mutate_plan = get_mutation_plan(
                global_test_schema,
                mutation_pieces
            )

            const goal = {
                mutation_pieces: [mutation_pieces[1], mutation_pieces[0]],
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
            const mutation_plan: Pick<
                MutationPlan,
                'mutation_pieces' | 'mutation_batches'
            > = {
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
                        mutation_batch: mutation_plan.mutation_batches[0],
                    })
                } else {
                    expect(context).to.deep.equal({
                        index: 1,
                        mutation_batch: mutation_plan.mutation_batches[1],
                    })
                }
                i += 1
            })
        })
    })
    test.skip('handles duplicate foreign key values for different entities')
})
