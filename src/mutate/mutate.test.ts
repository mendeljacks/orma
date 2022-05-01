import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../introspector/introspector'
import { add_foreign_key_indexes } from './helpers/add_foreign_key_indexes'
import {
    generate_foreign_key_query,
    mysql_fn,
    orma_mutate,
    statements,
} from './mutate'

export const orma_test_schema: OrmaSchema = {
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
        batch_id: {},
        $indexes: [
            {
                index_name: 'batch_id_unique',
                fields: ['batch_id'],
                is_unique: true,
            },
        ],
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

describe('mutate', () => {
    describe(add_foreign_key_indexes.name, () => {
        test('works with multiple identifying keys', () => {
            const statements = [
                {
                    paths: [
                        ['parents', 0],
                        ['parents', 1],
                    ],
                    route: ['parents'],
                },
            ]

            const query_results = [
                [
                    {
                        // unique key
                        unique1: 1,
                        grandparent_id: 11,
                    },
                    {
                        // simple primary key
                        id: 3,
                        grandparent_id: 13,
                    },
                ],
            ]

            // note that the order of the mutation is not the same as the query results order (this is to make
            // sure the function is being tested properly)
            const mutation = {
                parents: [
                    { id: 3 },
                    {
                        unique1: 1,
                    },
                ],
            }

            const result = add_foreign_key_indexes(
                statements,
                query_results,
                mutation,
                orma_test_schema
            )

            expect(result).to.deep.equal({
                '["parents",0]': {
                    id: 3,
                    grandparent_id: 13,
                },
                '["parents",1]': {
                    unique1: 1,
                    grandparent_id: 11,
                },
            })
        })
        test('works with multiple statements', () => {
            const statements = [
                {
                    paths: [['parents', 0]],
                    route: ['parents'],
                },
                {
                    paths: [['parents', 0, 'children', 0]],
                    route: ['parents', 'children'],
                },
            ]

            const query_results = [
                [
                    {
                        id: 1,
                        grandparent_id: 11,
                    },
                ],
                [{ id1: 1, id2: 2, parent_id: 12 }],
            ]

            const mutation = {
                parents: [
                    {
                        id: 1,
                        children: [
                            {
                                // composite primary key
                                id1: 1,
                                id2: 2,
                            },
                        ],
                    },
                ],
            }

            const result = add_foreign_key_indexes(
                statements,
                query_results,
                mutation,
                orma_test_schema
            )

            expect(result).to.deep.equal({
                '["parents",0]': {
                    id: 1,
                    grandparent_id: 11,
                },
                '["parents",0,"children",0]': { id1: 1, id2: 2, parent_id: 12 },
            })
        })
        test('works with duplicate keys', () => {
            // this situation could happen e.g. if there are rows in different locations in the mutation
            const statements = [
                {
                    paths: [
                        ['parents', 0],
                        ['parents', 1],
                    ],
                    route: ['parents'],
                },
            ]

            const query_results = [
                [
                    {
                        id: 1,
                        grandparent_id: 11,
                    },
                ],
            ]

            const mutation = {
                parents: [
                    { id: 1 },
                    {
                        id: 1,
                    },
                ],
            }

            const result = add_foreign_key_indexes(
                statements,
                query_results,
                mutation,
                orma_test_schema
            )

            // it should add foreign keys to both locations, even though they have the same id and there is only
            // on record returned from the database
            expect(result).to.deep.equal({
                '["parents",0]': {
                    id: 1,
                    grandparent_id: 11,
                },
                '["parents",1]': {
                    id: 1,
                    grandparent_id: 11,
                },
            })
        })
        test('allows taking first unique key in creates', () => {
            // this situation could happen e.g. if there are rows in different locations in the mutation
            const statements = [
                {
                    paths: [['parents', 0]],
                    route: ['parents'],
                },
            ]

            const query_results = [
                [
                    {
                        id: 1,
                        unique1: 1,
                        unique2: 2,
                    },
                ],
            ]

            const mutation = {
                parents: [{ $operation: 'create', unique1: 1, unique2: 2 }],
            }

            const result = add_foreign_key_indexes(
                statements,
                query_results,
                mutation,
                orma_test_schema
            )

            // it should add foreign keys to both locations, even though they have the same id and there is only
            // on record returned from the database
            expect(result).to.deep.equal({
                '["parents",0]': {
                    id: 1,
                    unique1: 1,
                    unique2: 2,
                },
            })
        })
    })

    describe(generate_foreign_key_query.name, () => {
        test.skip('basic test')
    })

    describe(orma_mutate.name, () => {
        test('basic integration test', async () => {
            const mutation = {
                parents: [
                    {
                        $operation: 'create',
                        unique1: 'test1',
                        grandparent_id: 5,
                        children: [
                            {
                                batch_id: 11,
                            },
                            {
                                batch_id: 12,
                            },
                        ],
                        step_children: [
                            {
                                id: 2,
                            },
                        ],
                    },
                    {
                        $operation: 'update',
                        id: 2,
                        grandparent_id: 6,
                    },
                ],
            }

            let call_count = -1
            const mysql_fn: mysql_fn = async (statements: statements) => {
                call_count++
                if (call_count === 1) {
                    // Parent rows
                    return [[{ unique1: 'test1', id: 1 }]]
                }

                return []
            }

            const results = await orma_mutate(
                mutation,
                mysql_fn,
                orma_test_schema
            )

            const goal = {
                parents: [
                    {
                        $operation: 'create',
                        id: 1,
                        unique1: 'test1',
                        grandparent_id: 5,
                        children: [
                            {
                                $operation: 'create',
                                parent_id: 1,
                                batch_id: 11,
                            },
                            {
                                $operation: 'create',
                                parent_id: 1,
                                batch_id: 12,
                            },
                        ],
                        step_children: [
                            { $operation: 'create', parent_id: 1, id: 2 },
                        ],
                    },
                    {
                        id: 2,
                        $operation: 'update',
                        grandparent_id: 6,
                    },
                ],
            }

            expect(results).to.deep.equal(goal)
        })
        test('integrates orma mutation components reverse nesting', async () => {
            const mutation = {
                $operation: 'create',
                children: [
                    {
                        parents: [
                            {
                                unique1: 12,
                            },
                        ],
                    },
                ],
            }

            let call_count = -1
            const mutate_fn: mysql_fn = async (statements: statements) => {
                call_count++
                if (call_count === 1) {
                    // Parent rows
                    return [[{ id: 0, unique1: 12 }]]
                }

                return []
            }

            const results = await orma_mutate(
                mutation,
                mutate_fn,
                orma_test_schema
            )

            const goal = {
                $operation: 'create',
                children: [
                    {
                        $operation: 'create',
                        parent_id: 0,
                        parents: [
                            {
                                $operation: 'create',
                                id: 0,
                                unique1: 12,
                            },
                        ],
                    },
                ],
            }

            expect(results).to.deep.equal(goal)
        })
        test.skip('escapes values')
        test.skip('can nest in keys from parent table results')
        test.skip('can nest in keys from child table results')
        test.skip('can throw an error if there is not a single foreign key')
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
