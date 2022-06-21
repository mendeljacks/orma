import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../../introspector/introspector'
import { get_mutation_statements } from '../operation_macros'

describe('operation_macros.ts', () => {
    const orma_schema: OrmaSchema = {
        grandparents: {
            id: {
                primary_key: true,
                not_null: true,
            },
            quantity: {},
        },
        parents: {
            id: {
                primary_key: true,
                not_null: true,
            },
            unique1: {
                not_null: true,
            },
            unique2: {
                not_null: true,
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
                not_null: true,
            },
            id2: {
                primary_key: true,
                not_null: true,
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
                not_null: true,
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

    describe(get_mutation_statements.name, () => {
        test('update by id', () => {
            const mutation = {
                grandparents: [
                    {
                        $operation: 'update',
                        id: 1,
                        quantity: 2,
                    },
                ],
            }

            const result = get_mutation_statements(
                [
                    {
                        record: mutation.grandparents[0],
                        path: ['grandparents', 0],
                    },
                ],
                {},
                orma_schema
            ).map(el => el.ast)

            const goal = [
                {
                    $update: 'grandparents',
                    $set: [['quantity', 2]],
                    $where: { $eq: ['id', 1] },
                },
            ]

            expect(result).to.deep.equal(goal)
        })
        test('primary key has precedence over unique', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'update',
                        id: 1,
                        unique1: 'john',
                    },
                ],
            }

            const result = get_mutation_statements(
                [
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                ],
                {},
                orma_schema
            ).map(el => el.ast)

            const goal = [
                {
                    $update: 'parents',
                    $set: [['unique1', "'john'"]],
                    $where: { $eq: ['id', 1] },
                },
            ]

            expect(result).to.deep.equal(goal)
        })
        test('update by unique field', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'update',
                        unique1: 'john',
                        quantity: 5,
                    },
                ],
            }

            const result = get_mutation_statements(
                [
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                ],
                {},
                orma_schema
            ).map(el => el.ast)

            const goal = [
                {
                    $update: 'parents',
                    $set: [['quantity', 5]],
                    $where: { $eq: ['unique1', "'john'"] },
                },
            ]

            expect(result).to.deep.equal(goal)
        })
        test('throws on no identifying key', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'update',
                        quantity: 5, // quantity is not unique, so it can't be used to update with
                    },
                ],
            }

            try {
                const result = get_mutation_statements(
                    [
                        {
                            record: mutation.parents[0],
                            path: ['parents', 0],
                        },
                    ],
                    {},
                    orma_schema
                ).map(el => el.ast)
                expect('should have thrown an error').to.equal(true)
            } catch (error) {
                // error was thrown as it should be
            }
        })
        test('throws on multiple unique update keys', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'update',
                        unique1: 'test',
                        unique2: 'testing',
                        quantity: 5,
                    },
                ],
            }

            try {
                const result = get_mutation_statements(
                    [
                        {
                            record: mutation.parents[0],
                            path: ['parents', 0],
                        },
                    ],
                    {},
                    orma_schema
                ).map(el => el.ast)
                expect('should have thrown an error').to.equal(true)
            } catch (error) {}
        })
        test('handles compound primary key', () => {
            const mutation = {
                children: [
                    {
                        $operation: 'update',
                        id1: 4,
                        id2: 5,
                        parent_id: 6,
                    },
                ],
            }

            const result = get_mutation_statements(
                [
                    {
                        record: mutation.children[0],
                        path: ['children', 0],
                    },
                ],
                {},
                orma_schema
            ).map(el => el.ast)

            const goal = [
                {
                    $update: 'children',
                    $set: [['parent_id', 6]],
                    $where: {
                        $and: [
                            {
                                $eq: ['id1', 4],
                            },
                            {
                                $eq: ['id2', 5],
                            },
                        ],
                    },
                },
            ]

            expect(result).to.deep.equal(goal)
        })
        // alot of the logic is shared between update and delete functions, so we dont need to repeat all
        // the tests that we already did with the update function
        test('handles deletes', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'delete',
                        id: 4,
                    },
                ],
            }

            const result = get_mutation_statements(
                [
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                ],
                {},
                orma_schema
            ).map(el => el.ast)

            const goal = [
                {
                    $delete_from: 'parents',
                    $where: { $eq: ['id', 4] },
                },
            ]

            expect(result).to.deep.equal(goal)
        })
        test('handles guid resolving', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'create',
                        id: { $guid: 'a' },
                    },
                    {
                        $operation: 'update',
                        id: 1,
                        grandparent_id: { $guid: 'a' },
                    },
                ],
            }

            const values_by_guid = {
                a: 12,
            }

            const result = get_mutation_statements(
                [
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                    {
                        record: mutation.parents[1],
                        path: ['parents', 1],
                    },
                ],
                values_by_guid,
                orma_schema
            ).map(el => el.ast)

            const goal = [
                {
                    $insert_into: ['parents', ['id']],
                    $values: [[12]],
                },
                {
                    $update: 'parents',
                    $set: [['grandparent_id', 12]],
                    $where: { $eq: ['id', 1] },
                },
            ]

            expect(result).to.deep.equal(goal)
        })
        test('doesnt allow $guid on a chosen identifying key', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'update',
                        // id would usually be chose to identify this row to update, but instead unique1 is chosen
                        // since id is a $guid
                        id: { $guid: 'a' },
                        unique1: 1,
                        quantity: 2,
                    },
                ],
            }

            const values_by_guid = {
                a: 12,
            }

            try {
                const result = get_mutation_statements(
                    [
                        {
                            record: mutation.parents[0],
                            path: ['parents', 0],
                        },
                    ],
                    values_by_guid,
                    orma_schema
                ).map(el => el.ast)
                expect('should have been an error').to.equal(true)
            } catch (error) {}
        })
        test('handles stub updates', () => {
            const mutation = {
                parents: [
                    {
                        // ignored
                        $operation: 'update',
                        id: 1,
                    },
                    {
                        // included
                        $operation: 'delete',
                        id: 1,
                    },
                    {
                        // included
                        $operation: 'create',
                    },
                ],
            }

            const result = get_mutation_statements(
                [
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                    {
                        record: mutation.parents[1],
                        path: ['parents', 1],
                    },
                    {
                        record: mutation.parents[2],
                        path: ['parents', 2],
                    },
                ],
                {},
                orma_schema
            ).map(el => el.ast)

            const goal = [
                {
                    $delete_from: 'parents',
                    $where: { $eq: ['id', 1] },
                },
                {
                    $insert_into: ['parents', []],
                    $values: [[]],
                },
            ]

            expect(result).to.deep.equal(goal)
        })
    })
})