import { expect } from 'chai'
import { describe, test } from 'mocha'
import { orma_schema } from '../../introspector/introspector'
import {
    get_create_ast,
    get_delete_ast,
    get_update_asts,
} from './operation_macros'

const escape_fn = el => (typeof el === 'string' ? `\`${el}\`` : el)

describe('operation_macros.ts', () => {
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

    describe(get_create_ast.name, () => {})

    describe(get_update_asts.name, () => {
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

            const result = get_update_asts(
                'grandparents',
                [['grandparents', 0]],
                mutation,
                orma_schema,
                escape_fn
            )
            const goal = [
                {
                    $update: 'grandparents',
                    $set: [['quantity', 2]],
                    $where: { $eq: ['id', 1] },
                },
            ]

            expect(result).to.deep.equal(goal)
        })
        test('foreign key has precedence over unique', () => {
            const mutation = {
                parents: [
                    {
                        id: 1,
                        unique1: 'john',
                    },
                ],
            }

            const result = get_update_asts(
                'parents',
                [['parents', 0]],
                mutation,
                orma_schema,
                escape_fn
            )
            const goal = [
                {
                    $update: 'parents',
                    $set: [['unique1', '`john`']],
                    $where: { $eq: ['id', 1] },
                },
            ]

            expect(result).to.deep.equal(goal)
        })
        test('update by unique field', () => {
            const mutation = {
                parents: [
                    {
                        unique1: 'john',
                        quantity: 5,
                    },
                ],
            }

            const result = get_update_asts(
                'parents',
                [['parents', 0]],
                mutation,
                orma_schema,
                escape_fn
            )
            const goal = [
                {
                    $update: 'parents',
                    $set: [['quantity', 5]],
                    $where: { $eq: ['unique1', '`john`'] },
                },
            ]

            expect(result).to.deep.equal(goal)
        })
        test('throws on no identifying key', () => {
            const mutation = {
                parents: [
                    {
                        quantity: 5, // quantity is not unique, so it can't be used to update with
                    },
                ],
            }

            try {
                const result = get_update_asts(
                    'parents',
                    [['parents', 0]],
                    mutation,
                    orma_schema,
                    escape_fn
                )
                expect('should have thrown an error').to.equal(true)
            } catch (error) {
                // error was thrown as it should be
            }
        })
        test('throws on multiple unique update keys', () => {
            const mutation = {
                parents: [
                    {
                        unique1: 'test',
                        unique2: 'testing',
                        quantity: 5,
                    },
                ],
            }

            try {
                const result = get_update_asts(
                    'parents',
                    [['parents', 0]],
                    mutation,
                    orma_schema,
                    escape_fn
                )
                expect('should have thrown an error').to.equal(true)
            } catch (error) {}
        })
        test('handles compound primary key', () => {
            const mutation = {
                children: [
                    {
                        id1: 4,
                        id2: 5,
                        parent_id: 6,
                    },
                ],
            }

            const result = get_update_asts(
                'children',
                [['children', 0]],
                mutation,
                orma_schema,
                escape_fn
            )
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
    })

    describe(get_delete_ast.name, () => {
        // alot of the logic is shared between update and delete functions, so we dont need to repeat all
        // the tests that we already did with the update function
        test('handles deletes', () => {
            const mutation = {
                parents: [
                    {
                        id: 4,
                    },
                ],
            }

            const result = get_delete_ast(
                'parents',
                [['parents', 0]],
                mutation,
                orma_schema,
                escape_fn
            )
            const goal = {
                $delete_from: 'parents',
                $where: { $eq: ['id', 4] },
            }

            expect(result).to.deep.equal(goal)
        })
    })
})

// TODO: write tests for create ast function
