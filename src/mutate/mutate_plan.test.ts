import { expect } from 'chai'
import { describe, test } from 'mocha'
import { orma_schema } from '../introspector/introspector'
import { get_mutate_plan } from './mutate_plan'

describe('mutation_plan.ts', () => {
    const orma_schema: orma_schema = {
        grandparents: {
            id: {
                primary_key: true,
            },
            quantity: {},
        },
        parents: {
            id: {
                primary_key: true,
                required: true,
            },
            unique1: {
                required: true,
            },
            unique2: {
                required: true,
            },
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

    describe(get_mutate_plan.name, () => {
        test('simple mutation', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'create',
                        children: [
                            {
                                $operation: 'create',
                            },
                            {
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    {
                        operation: 'create',
                        paths: [['parents', 0]],
                        route: ['parents'],
                    },
                ],
                [
                    {
                        operation: 'create',
                        paths: [
                            ['parents', 0, 'children', 0],
                            ['parents', 0, 'children', 1],
                        ],
                        route: ['parents', 'children'],
                    },
                ],
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects operation precedence', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'delete',
                    },
                    {
                        $operation: 'update',
                    },
                    {
                        $operation: 'create',
                    },
                ],
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    { operation: 'delete', paths: [['parents', 0]], route: ['parents'] },
                    { operation: 'update', paths: [['parents', 1]], route: ['parents'] },
                    { operation: 'create', paths: [['parents', 2]], route: ['parents'] },
                ],
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects topological ordering for create', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'create',
                        children: [
                            {
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    {
                        operation: 'create',
                        paths: [['parents', 0]],
                        route: ['parents'],
                    },
                ],
                [
                    {
                        operation: 'create',
                        paths: [['parents', 0, 'children', 0]],
                        route: ['parents', 'children'],
                    },
                ],
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects topological ordering for update', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'update',
                        children: [
                            {
                                $operation: 'update',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            // update order is not guaranteed
            const goal = [
                [
                    {
                        operation: 'update',
                        paths: [['parents', 0]],
                        route: ['parents'],
                    },
                    {
                        operation: 'update',
                        paths: [['parents', 0, 'children', 0]],
                        route: ['parents', 'children'],
                    },
                ],
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects topological ordering for delete', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'delete',
                        children: [
                            {
                                $operation: 'delete',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    {
                        operation: 'delete',
                        paths: [['parents', 0, 'children', 0]],
                        route: ['parents', 'children'],
                    },
                ],
                [
                    {
                        operation: 'delete',
                        paths: [['parents', 0]],
                        route: ['parents'],
                    },
                ],
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles mixed operation requests', () => {
            const mutation = {
                grandparents: [
                    {
                        $operation: 'update',
                        parents: [
                            {
                                $operation: 'delete',
                                children: [
                                    {
                                        $operation: 'delete',
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        $operation: 'create',
                        parents: [
                            {
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    {
                        operation: 'update',
                        paths: [['grandparents', 0]],
                        route: ['grandparents'],
                    },
                    {
                        operation: 'delete',
                        paths: [
                            ['grandparents', 0, 'parents', 0, 'children', 0],
                        ],
                        route: ['grandparents', 'parents', 'children'],
                    },
                    {
                        operation: 'create',
                        paths: [['grandparents', 1]],
                        route: ['grandparents'],
                    },
                ],
                [
                    {
                        operation: 'delete',
                        paths: [['grandparents', 0, 'parents', 0]],
                        route: ['grandparents', 'parents'],
                    },
                    {
                        operation: 'create',
                        paths: [['grandparents', 1, 'parents', 0]],
                        route: ['grandparents', 'parents'],
                    },
                ],
            ]

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

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    {
                        operation: 'update',
                        paths: [['parents', 0]],
                        route: ['parents'],
                    },
                ],
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles reverse nesting', () => {
            const mutation = {
                children: [
                    {
                        $operation: 'create',
                        parents: [
                            {
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    {
                        operation: 'create',
                        paths: [['children', 0, 'parents', 0]],
                        route: ['children', 'parents'],
                    },
                ],
                [
                    {
                        operation: 'create',
                        paths: [['children', 0]],
                        route: ['children'],
                    },
                ],
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles zigzag nesting', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'create',
                        children: [
                            {
                                $operation: 'create',
                                parents: [
                                    {
                                        $operation: 'create',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    {
                        operation: 'create',
                        paths: [['parents', 0]],
                        route: ['parents'],
                    },
                    {
                        operation: 'create',
                        paths: [['parents', 0, 'children', 0, 'parents', 0]],
                        route: ['parents', 'children', 'parents'],
                    },
                ],
                [
                    {
                        operation: 'create',
                        paths: [['parents', 0, 'children', 0]],
                        route: ['parents', 'children'],
                    },
                ],
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
    })
})
