import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../../schema/introspector'
import { MutationPiece } from '../../plan/mutation_plan'
import {
    get_create_ast,
    get_delete_ast,
    get_update_ast,
} from '../mutation_operations'

describe('mutation_operations.ts', () => {
    const orma_schema: OrmaSchema = {
        $entities: {
            grandparents: {
                $fields: {
                    id: { primary_key: true, not_null: true },
                    quantity: {},
                },
                $database_type: 'mysql',
            },
            parents: {
                $fields: {
                    id: { primary_key: true, not_null: true },
                    unique1: { not_null: true },
                    unique2: { not_null: true },
                    quantity: {},
                    grandparent_id: {},
                },
                $database_type: 'mysql',
                $indexes: [
                    { index_name: 'primary', fields: ['id'], is_unique: true },
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
                $foreign_keys: [
                    {
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                ],
            },
            children: {
                $fields: {
                    id1: { primary_key: true, not_null: true },
                    id2: { primary_key: true, not_null: true },
                    parent_id: {},
                },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id',
                    },
                ],
            },
            step_children: {
                $fields: {
                    id: { primary_key: true, not_null: true },
                    parent_id: {},
                },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id',
                    },
                ],
            },
        },
        $cache: {
            $reversed_foreign_keys: {
                grandparents: [
                    {
                        from_field: 'id',
                        to_entity: 'parents',
                        to_field: 'grandparent_id',
                    },
                ],
                parents: [
                    {
                        from_field: 'id',
                        to_entity: 'children',
                        to_field: 'parent_id',
                    },
                    {
                        from_field: 'id',
                        to_entity: 'step_children',
                        to_field: 'parent_id',
                    },
                ],
            },
        },
    }

    describe(get_update_ast.name, () => {
        test('update by id', () => {
            const mutation_piece: MutationPiece = {
                record: {
                    $operation: 'update',
                    id: 1,
                    quantity: 2,
                },
                path: ['grandparents', 0],
            }

            const result = get_update_ast(mutation_piece, {}, orma_schema)

            const goal = {
                $update: 'grandparents',
                $set: [['quantity', 2]],
                $where: { $eq: ['id', 1] },
            }

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
            } as const

            const result = get_update_ast(
                {
                    record: mutation.parents[0],
                    path: ['parents', 0],
                },
                {},
                orma_schema
            )

            const goal = {
                $update: 'parents',
                $set: [['unique1', "'john'"]],
                $where: { $eq: ['id', 1] },
            }

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
            } as const

            const result = get_update_ast(
                {
                    record: mutation.parents[0],
                    path: ['parents', 0],
                },
                {},
                orma_schema
            )

            const goal = {
                $update: 'parents',
                $set: [['quantity', 5]],
                $where: { $eq: ['unique1', "'john'"] },
            }

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
            } as const

            try {
                const result = get_update_ast(
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                    {},
                    orma_schema
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
                        $operation: 'update',
                        unique1: 'test',
                        unique2: 'testing',
                        quantity: 5,
                    },
                ],
            } as const

            try {
                const result = get_update_ast(
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                    {},
                    orma_schema
                )
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
            } as const

            const result = get_update_ast(
                {
                    record: mutation.children[0],
                    path: ['children', 0],
                },
                {},
                orma_schema
            )

            const goal = {
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
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles guid resolving for updates', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'update',
                        id: 1,
                        grandparent_id: { $guid: 'a' },
                    },
                ],
            } as const

            const values_by_guid = {
                a: 12,
            }

            const result = get_update_ast(
                {
                    record: mutation.parents[0],
                    path: ['parents', 0],
                },
                values_by_guid,
                orma_schema
            )

            const goal = {
                $update: 'parents',
                $set: [['grandparent_id', 12]],
                $where: { $eq: ['id', 1] },
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles empty update', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'update',
                        id: 1,
                    },
                ],
            } as const

            const values_by_guid = {}

            const result = get_update_ast(
                {
                    record: mutation.parents[0],
                    path: ['parents', 0],
                },
                values_by_guid,
                orma_schema
            )

            const goal = undefined

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
            } as const

            const values_by_guid = {
                a: 12,
            }

            try {
                const result = get_update_ast(
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                    values_by_guid,
                    orma_schema
                )
                expect('should have been an error').to.equal(true)
            } catch (error) {}
        })
    })
    describe(get_delete_ast.name, () => {
        // alot of the logic is shared between update and delete functions, so we dont need to repeat all
        // the tests that we already did with the update function
        test('batches deletes', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'delete',
                        id: 4,
                    },
                    {
                        $operation: 'delete',
                        id: 5,
                    },
                ],
            } as const

            const result = get_delete_ast(
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
                'parents',
                {},
                orma_schema
            )

            const goal = {
                $delete_from: 'parents',
                $where: { $or: [{ $eq: ['id', 4] }, { $eq: ['id', 5] }] },
            }

            expect(result).to.deep.equal(goal)
        })
    })
    describe(get_create_ast.name, () => {
        test('batches creates', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'create',
                        id: 1,
                        quantity: 11,
                    },
                    {
                        $operation: 'create',
                        quantity: 22,
                        id: 2,
                    },
                ],
            } as const

            const values_by_guid = {
                a: 12,
            }

            const result = get_create_ast(
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
                'parents',
                values_by_guid,
                orma_schema
            )

            const goal = {
                $insert_into: ['parents', ['id', 'quantity']],
                $values: [
                    [1, 11],
                    [2, 22],
                ],
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles creating empty record', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'create',
                    },
                ],
            } as const

            const values_by_guid = {
                a: 12,
            }

            const result = get_create_ast(
                [
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                ],
                'parents',
                values_by_guid,
                orma_schema
            )

            const goal = {
                $insert_into: ['parents', []],
                $values: [[]],
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles guid resolving for creates', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'create',
                        id: { $guid: 'a' },
                    },
                ],
            } as const

            const values_by_guid = {
                a: 12,
            }

            const result = get_create_ast(
                [
                    {
                        record: mutation.parents[0],
                        path: ['parents', 0],
                    },
                ],
                'parents',
                values_by_guid,
                orma_schema
            )

            const goal = {
                $insert_into: ['parents', ['id']],
                $values: [[12]],
            }

            expect(result).to.deep.equal(goal)
        })
    })
})
