import { expect } from 'chai'
import { describe, test } from 'mocha'
import { orma_schema } from '../introspector/introspector'
import { get_command_jsons, get_mutate_plan, mutate_fn, orma_mutate, statements } from './mutate'

describe('mutate', () => {
    const orma_schema: orma_schema = {
        grandparents: {
            id: {
                primary_key: true
            },
            quantity: {}
        },
        parents: {
            id: {
                primary_key: true,
                unique: true
            },
            unique1: {
                unique: true
            },
            unique2: {
                unique: true
            },
            quantity: {},
            grandparent_id: {
                references: {
                    grandparents: {
                        id: {}
                    }
                }
            }
        },
        children: {
            id1: {
                primary_key: true
            },
            id2: {
                primary_key: true
            },
            parent_id: {
                references: {
                    parents: {
                        id: {}
                    }
                }
            }
        },
        step_children: {
            id: {
                primary_key: true
            },
            parent_id: {
                references: {
                    parents: {
                        id: {}
                    }
                }
            }
        }
    }

    describe(get_mutate_plan.name, () => {
        test('simple mutation', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'create',
                        children: [
                            {
                                $operation: 'create'
                            },
                            {
                                $operation: 'create'
                            }
                        ]
                    }
                ]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [{ operation: 'create', paths: [['parents', 0]] }],
                [
                    {
                        operation: 'create',
                        paths: [
                            ['parents', 0, 'children', 0],
                            ['parents', 0, 'children', 1]
                        ]
                    }
                ]
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects operation precedence', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'delete'
                    },
                    {
                        $operation: 'update'
                    },
                    {
                        $operation: 'create'
                    }
                ]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    { operation: 'delete', paths: [['parents', 0]] },
                    { operation: 'update', paths: [['parents', 1]] },
                    { operation: 'create', paths: [['parents', 2]] }
                ]
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
                                $operation: 'create'
                            }
                        ]
                    }
                ]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [{ operation: 'create', paths: [['parents', 0]] }],
                [{ operation: 'create', paths: [['parents', 0, 'children', 0]] }]
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
                                $operation: 'update'
                            }
                        ]
                    }
                ]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            // update order is not guaranteed
            const goal = [
                [
                    { operation: 'update', paths: [['parents', 0]] },
                    { operation: 'update', paths: [['parents', 0, 'children', 0]] }
                ]
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
                                $operation: 'delete'
                            }
                        ]
                    }
                ]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [{ operation: 'delete', paths: [['parents', 0, 'children', 0]] }],
                [{ operation: 'delete', paths: [['parents', 0]] }]
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
                                        $operation: 'delete'
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        $operation: 'create',
                        parents: [
                            {
                                $operation: 'create'
                            }
                        ]
                    }
                ]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    { operation: 'update', paths: [['grandparents', 0]] },
                    {
                        operation: 'delete',
                        paths: [['grandparents', 0, 'parents', 0, 'children', 0]]
                    },
                    { operation: 'create', paths: [['grandparents', 1]] }
                ],
                [
                    { operation: 'delete', paths: [['grandparents', 0, 'parents', 0]] },
                    { operation: 'create', paths: [['grandparents', 1, 'parents', 0]] }
                ]
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles entity with no children', () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'update'
                    }
                ]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [[{ operation: 'update', paths: [['parents', 0]] }]]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles reverse nesting', () => {
            const mutation = {
                children: [
                    {
                        $operation: 'create',
                        parents: [
                            {
                                $operation: 'create'
                            }
                        ]
                    }
                ]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [{ operation: 'create', paths: [['children', 0, 'parents', 0]] }],
                [{ operation: 'create', paths: [['children', 0]] }]
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
    })
    describe(get_command_jsons.name, () => {
        test('update/delete by id', () => {
            const mutation = {
                grandparents: [
                    {
                        $operation: 'update',
                        id: 1,
                        quantity: 2
                    }
                ]
            }

            const result = get_command_jsons(
                'update',
                [['grandparents', 0]],
                mutation,
                {},
                orma_schema
            )
            const goal = [
                {
                    paths: [['grandparents', 0]],
                    entity_name: 'grandparents',
                    command_json: {
                        $update: 'grandparents',
                        $set: [['quantity', 2]],
                        $where: { $eq: ['id', 1] }
                    },
                    command_sql: 'UPDATE grandparents SET quantity = 2 WHERE id = 1',
                    operation: 'update'
                }
            ]

            expect(result).to.deep.equal(goal)
        })
        test('foreign key has precedence over unique', () => {
            const mutation = {
                parents: [
                    {
                        id: 1,
                        unique1: 'john'
                    }
                ]
            }

            const result = get_command_jsons('update', [['parents', 0]], mutation, {}, orma_schema)
            const goal = [
                {
                    paths: [['parents', 0]],
                    entity_name: 'parents',
                    command_json: {
                        $update: 'parents',
                        $set: [['unique1', 'john']],
                        $where: { $eq: ['id', 1] }
                    },
                    command_sql: 'UPDATE parents SET unique1 = `john` WHERE id = 1',
                    operation: 'update'
                }
            ]

            expect(result).to.deep.equal(goal)
        })
        test('update/delete by unique', () => {
            const mutation = {
                parents: [
                    {
                        unique1: 'john',
                        quantity: 5
                    }
                ]
            }

            const result = get_command_jsons('update', [['parents', 0]], mutation, {}, orma_schema)
            const goal = [
                {
                    paths: [['parents', 0]],
                    entity_name: 'parents',
                    command_json: {
                        $update: 'parents',
                        $set: [['quantity', 5]],
                        $where: { $eq: ['unique1', 'john'] }
                    },
                    command_sql: 'UPDATE parents SET quantity = 5 WHERE unique1 = `john`',
                    operation: 'update'
                }
            ]

            expect(result).to.deep.equal(goal)
        })
        test('throws on no update key', () => {
            const mutation = {
                parents: [
                    {
                        quantity: 5
                    }
                ]
            }

            try {
                const result = get_command_jsons(
                    'update',
                    [['parents', 0]],
                    mutation,
                    {},
                    orma_schema
                )
                expect('should have thrown an error').to.equal(true)
            } catch (error) {}
        })
        test('throws on multiple unique update keys', () => {
            const mutation = {
                parents: [
                    {
                        unique1: 'test',
                        unique2: 'testing',
                        quantity: 5
                    }
                ]
            }

            try {
                const result = get_command_jsons(
                    'update',
                    [['parents', 0]],
                    mutation,
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
                        id1: 4,
                        id2: 5,
                        parent_id: 6
                    }
                ]
            }

            const result = get_command_jsons('update', [['children', 0]], mutation, {}, orma_schema)
            const goal = [
                {
                    $update: 'children',
                    $set: [['parent_id', 6]],
                    $where: {
                        $and: [
                            {
                                $eq: ['id1', 4]
                            },
                            {
                                $eq: ['id2', 5]
                            }
                        ]
                    }
                }
            ]

            expect(result).to.deep.equal(goal)
        })
        test('handles deletes', () => {
            const mutation = {
                parents: [
                    {
                        id: 4
                    }
                ]
            }

            const result = get_command_jsons('delete', [['parents', 0]], mutation, {}, orma_schema)
            const goal = [
                {
                    paths: [['parents', 0]],
                    entity_name: 'parents',
                    command_json: { $delete_from: 'parents', $where: { $eq: ['id', 4] } },
                    command_sql: 'DELETE FROM parents WHERE id = 4',
                    operation: 'delete'
                }
            ]

            expect(result).to.deep.equal(goal)
        })
    })
    describe(orma_mutate.name, () => {
        test('integrates orma mutation components', async () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'create',
                        unique1: 'test1',
                        grandparent_id: 5,
                        children: [{}, {}],
                        step_children: [{}]
                    },
                    {
                        $operation: 'create',
                        unique1: 'test2',
                        grandparent_id: 5,
                        children: [{}, {}]
                    }
                ]
            }

            let call_count = -1
            const mutate_fn: mutate_fn = async (statements: statements) => {
                call_count++
                if (call_count === 0) {
                    // Parent rows
                    const res = statements.flatMap(statement =>
                        statement.paths.map((path, i) => ({ path, row: { id: i } }))
                    )
                    return res
                }
                if (call_count === 1) {
                    const res = statements.flatMap((statement, i) => {
                        return statement.paths.map((path, j) => ({
                            path,
                            row: { parent_id: path[1] }
                        }))
                    })
                    return res
                }
            }
            const escape_fn = i => i
            // const escape_fn = val => typeof val === 'string' ? `"${val}"` : val
            const results = await orma_mutate(mutation, mutate_fn, escape_fn, orma_schema)

            const goal = {
                parents: [
                    {
                        id: 0,
                        $operation: 'create',
                        unique1: 'test1',
                        grandparent_id: 5,
                        children: [{ parent_id: 0 }, { parent_id: 0 }],
                        step_children: [{ parent_id: 0 }]
                    },
                    {
                        id: 1,
                        $operation: 'create',
                        unique1: 'test2',
                        grandparent_id: 5,
                        children: [{ parent_id: 1 }, { parent_id: 1 }]
                    }
                ]
            }

            expect(results).to.deep.equal(goal)
        })
        test('integrates orma mutation components reverse nesting', async () => {
            const mutation = {
                $operation: 'create',
                children: [
                    {
                        parents: [{}]
                    }
                ]
            }

            let call_count = -1
            const mutate_fn: mutate_fn = async (statements: statements) => {
                call_count++
                if (call_count === 0) {
                    // Parent rows
                    const res = statements.flatMap(statement =>
                        statement.paths.map((path, i) => ({ path, row: { id: i } }))
                    )
                    return res
                }
                if (call_count === 1) {
                    const res = statements.flatMap((statement, i) => {
                        return statement.paths.map((path, j) => ({
                            path,
                            row: { parent_id: 0 }
                        }))
                    })
                    return res
                }
            }
            const escape_fn = i => i
            // const escape_fn = val => typeof val === 'string' ? `"${val}"` : val
            const results = await orma_mutate(mutation, mutate_fn, escape_fn, orma_schema)

            const goal = {
                children: [
                    {
                        id: 0,
                        parent_id: 0,
                        $operation: 'create',
                        parents: [{
                            $operation: 'create',
                            id: 0
                        }]
                    }
                ]
            }

            expect(results).to.deep.equal(goal)
        })
        test('escapes values')
        test('can nest in keys from parent table results')
        test('can nest in keys from child table results')
        test('can throw an error if there is not a single foreign key')
    })
})

/*

{
    parents: [{
        $operation: 'create',
        $where: {

        }
    }]
}

*/
