import { expect } from 'chai'
import { describe, test } from 'mocha'
import { orma_schema } from '../introspector/introspector'
import { get_mutate_plan } from './mutate'

describe.only('mutate', () => {
    const orma_schema: orma_schema = {
        grandparents: {
            id: {},
        },
        parents: {
            id: {},
            grandparent_id: {
                references: {
                    grandparents: {
                        id: {}
                    }
                }
            }
        },
        children: {
            id: {},
            parent_id: {
                references: {
                    parents: {
                        id: {}
                    }
                }
            }
        }
    }

    describe.only('get_mutate_plan', () => {
        test('simple mutation', () => {
            const mutation = {
                parents: [{
                    $operation: 'create',
                    children: [{
                        $operation: 'create',
                    }, {
                        $operation: 'create'
                    }]
                }]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [{ operation: 'create', paths: [['parents', 0]] }],
                [{ operation: 'create', paths: [['parents', 0, 'children', 0], ['parents', 0, 'children', 1]] }]
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects operation precedence', () => {
            const mutation = {
                parents: [{
                    $operation: 'delete',
                }, {
                    $operation: 'update'
                }, {
                    $operation: 'create'
                }]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    { operation: 'delete', paths: [['parents', 0]] },
                    { operation: 'update', paths: [['parents', 1]] },
                    { operation: 'create', paths: [['parents', 2]] },
                ]
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('respects topological ordering for create', () => {
            const mutation = {
                parents: [{
                    $operation: 'create',
                    children: [{
                        $operation: 'create'
                    }]
                }]
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
                parents: [{
                    $operation: 'update',
                    children: [{
                        $operation: 'update'
                    }]
                }]
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
                parents: [{
                    $operation: 'delete',
                    children: [{
                        $operation: 'delete'
                    }]
                }]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [{ operation: 'delete', paths: [['parents', 0, 'children', 0]] }],
                [{ operation: 'delete', paths: [['parents', 0]] }],
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles mixed operation requests', () => {
            const mutation = {
                grandparents: [{
                    $operation: 'update',
                    parents: [{
                        $operation: 'delete',
                        children: [{
                            $operation: 'delete'
                        }]
                    }]
                }, {
                    $operation: 'create',
                    parents: [{
                        $operation: 'create'
                    }]
                }]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [
                    { operation: 'update', paths: [['grandparents', 0]] },
                    { operation: 'delete', paths: [['grandparents', 0, 'parents', 0, 'children', 0]] },
                    { operation: 'create', paths: [['grandparents', 1]] }
                ], [
                    { operation: 'delete', paths: [['grandparents', 0, 'parents', 0]] },
                    { operation: 'create', paths: [['grandparents', 1, 'parents', 0]] }
                ]
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles entity with no children', () => {
            const mutation = {
                parents: [{
                    $operation: 'update',
                }]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [{ operation: 'update', paths: [['parents', 0]] }]
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
        test('handles reverse nesting', () => {
            const mutation = {
                children: [{
                    $operation: 'create',
                    parents: [{
                        $operation: 'create'
                    }]
                }]
            }

            const mutate_plan = get_mutate_plan(mutation, orma_schema)

            const goal = [
                [{ operation: 'create', paths: [['children', 0, 'parents', 0]] }],
                [{ operation: 'create', paths: [['children', 0]] }]
            ]

            expect(mutate_plan).to.deep.equal(goal)
        })
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