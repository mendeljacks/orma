import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../../introspector/introspector'
import { get_mutation_plan } from '../mutation_plan'

describe('mutation_plan.ts', () => {
    const orma_schema: OrmaSchema = {
        grandparents: {
            id: {
                primary_key: true,
            },
            quantity: {},
        },
        parents: {
            id: {
                primary_key: true,
            },
            unique1: {},
            unique2: {},
            quantity: {},
            grandparent_id: {
                references: {
                    grandparents: {
                        id: {},
                    },
                },
            },
            $indexes: [
                {
                    index_name: 'primary',
                    fields: ['id'],
                    is_unique: true,
                },
                {
                    index_name: 'unique1',
                    fields: ['unique1'],
                    is_unique: true,
                },
                {
                    index_name: 'unique2',
                    fields: ['unique2'],
                    is_unique: true,
                },
            ],
        },
        children: {
            id1: {
                primary_key: true,
            },
            id2: {
                primary_key: true,
            },
            parent_id: {
                references: {
                    parents: {
                        id: {},
                    },
                },
            },
        },
        step_children: {
            id: {
                primary_key: true,
            },
            parent_id: {
                references: {
                    parents: {
                        id: {},
                    },
                },
            },
        },
    }

    describe.only(get_mutation_plan.name, () => {
        test('handles simple mutation', () => {
            const mutation = {
                parents: [
                    {
                        id: { $guid: 1 },
                        $operation: 'create',
                        children: [
                            {
                                parent_id: { $guid: 1 },
                                $operation: 'create',
                            },
                            {
                                parent_id: { $guid: 1 },
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, orma_schema)

            const goal = {
                mutation_pieces: [
                    { record: mutation.parents[0], path: ['parents', 0] },
                    {
                        record: mutation.parents[0].children[0],
                        path: ['parents', 0, 'children', 0],
                    },
                    {
                        record: mutation.parents[0].children[1],
                        path: ['parents', 0, 'children', 1],
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
                parents: [
                    {
                        $operation: 'create',
                        id: 2,
                        children: [
                            {
                                parent_id: 2,
                                $operation: 'create',
                            },
                        ],
                    },
                ],
                children: [
                    {
                        $operation: 'create',
                        parent_id: 2,
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, orma_schema)

            const goal = {
                mutation_pieces: [
                    { record: mutation.parents[0], path: ['parents', 0] },
                    {
                        record: mutation.parents[0].children[0],
                        path: ['parents', 0, 'children', 0],
                    },
                    {
                        record: mutation.children[0],
                        path: ['children', 0],
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
        //         parents: [
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

        //     const mutate_plan = get_mutate_plan(mutation, orma_schema)

        //     const goal = [
        //         [
        //             {
        //                 operation: 'delete',
        //                 paths: [['parents', 0]],
        //                 route: ['parents'],
        //             },
        //             {
        //                 operation: 'update',
        //                 paths: [['parents', 1]],
        //                 route: ['parents'],
        //             },
        //             {
        //                 operation: 'create',
        //                 paths: [['parents', 2]],
        //                 route: ['parents'],
        //             },
        //         ],
        //     ]

        //     expect(mutate_plan).to.deep.equal(goal)
        // })
        test('respects topological ordering for updated foreign keys', () => {
            const mutation = {
                parents: [
                    {
                        id: 2,
                        $operation: 'create',
                    },
                ],
                children: [
                    {
                        id: 1,
                        parent_id: 2,
                        $operation: 'update',
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, orma_schema)

            const goal = {
                mutation_pieces: [
                    { record: mutation.parents[0], path: ['parents', 0] },
                    {
                        record: mutation.children[0],
                        path: ['children', 0],
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
                parents: [
                    {
                        id: 2,
                        $operation: 'update',
                    },
                    {
                        id: 3,
                        $operation: 'update',
                    },
                ],
                children: [
                    {
                        id: 2,
                        $operation: 'update',
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, orma_schema)

            // update order is not guaranteed
            const goal = {
                mutation_pieces: [
                    { record: mutation.parents[0], path: ['parents', 0] },
                    { record: mutation.parents[1], path: ['parents', 1] },
                    {
                        record: mutation.children[0],
                        path: ['children', 0],
                    },
                ],
                mutation_batches: [{ start_index: 0, end_index: 3 }],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects existing $guids', () => {
            const mutation = {
                parents: [
                    {
                        id: { $guid: 2 },
                        $operation: 'create',
                        children: [
                            {
                                parent_id: { $guid: 2 },
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, orma_schema)

            const goal = {
                mutation_pieces: [
                    { record: mutation.parents[0], path: ['parents', 0] },
                    {
                        record: mutation.parents[0].children[0],
                        path: ['parents', 0, 'children', 0],
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
                parents: [
                    {
                        id: { $guid: 1 },
                        $operation: 'delete',
                        children: [
                            {
                                parent_id: { $guid: 1 },
                                $operation: 'delete',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, orma_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.parents[0].children[0],
                        path: ['parents', 0, 'children', 0],
                    },
                    { record: mutation.parents[0], path: ['parents', 0] },
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
                grandparents: [
                    {
                        id: 1,
                        $operation: 'update',
                        parents: [
                            {
                                id: 2,
                                $operation: 'delete',
                                children: [
                                    {
                                        id: 3,
                                        parent_id: 2,
                                        $operation: 'delete',
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        id: { $guid: 1 },
                        $operation: 'create',
                        parents: [
                            {
                                grandparent_id: { $guid: 1 },
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            } as const

            const mutate_plan = get_mutation_plan(mutation, orma_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.grandparents[0],
                        path: ['grandparents', 0],
                    },
                    {
                        record: mutation.grandparents[0].parents[0].children[0],
                        path: ['grandparents', 0, 'parents', 0, 'children', 0],
                    },
                    {
                        record: mutation.grandparents[1],
                        path: ['grandparents', 1],
                    },
                    {
                        record: mutation.grandparents[0].parents[0],
                        path: ['grandparents', 0, 'parents', 0],
                    },
                    {
                        record: mutation.grandparents[1].parents[0],
                        path: ['grandparents', 1, 'parents', 0],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 3 },
                    { start_index: 3, end_index: 5 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles entity with no children', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'update',
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, orma_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                ],
                mutation_batches: [{ start_index: 0, end_index: 1 }],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles reverse nesting', () => {
            const mutation = {
                children: [
                    {
                        parent_id: { $guid: 1 },
                        $operation: 'create',
                        parents: [
                            {
                                id: { $guid: 1 },
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, orma_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.children[0].parents[0],
                        path: ['children', 0, 'parents', 0],
                    },
                    {
                        record: mutation.children[0],
                        path: ['children', 0],
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
                children: [
                    {
                        parent_id: { $guid: 1 },
                        $operation: 'create',
                        parents: [
                            {
                                id: { $guid: 1 },
                                $operation: 'create',
                                children: [
                                    {
                                        parent_id: { $guid: 1 },
                                        $operation: 'create',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutation_plan(mutation, orma_schema)

            const goal = {
                mutation_pieces: [
                    {
                        record: mutation.children[0].parents[0],
                        path: ['children', 0, 'parents', 0],
                    },
                    {
                        record: mutation.children[0],
                        path: ['children', 0],
                    },
                    {
                        record: mutation.children[0].parents[0].children[0],
                        path: ['children', 0, 'parents', 0, 'children', 0],
                    },
                ],
                mutation_batches: [
                    { start_index: 0, end_index: 1 },
                    { start_index: 1, end_index: 3 },
                ],
            }

            expect(mutate_plan).to.deep.equal(goal)
        })
    })
})
