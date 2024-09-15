import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../../helpers/helpers'
import { global_test_schema } from '../../test_data/global_test_schema'
import { OrmaSchema } from '../../schema/schema_types'
import {
    apply_where_connected_macro,
    get_upwards_connection_edges,
    restrict_where_connected,
} from './where_connected_macro'

describe('where_connected_macro.ts', () => {
    describe(get_upwards_connection_edges.name, () => {
        test('handles multiple tables', () => {
            const schema: OrmaSchema = {
                tables: {
                    grandparents: {
                        columns: { id: { $data_type: 'int' } },
                        database_type: 'mysql',
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
                    parents: {
                        columns: {
                            id: { $data_type: 'int' },
                            grandparent_id: { $data_type: 'int' },
                        },
                        database_type: 'mysql',
                        foreign_keys: [
                            {
                                $columns: ['grandparent_id'],
                                $references: {
                                    $table: 'grandparents',
                                    $columns: ['id'],
                                },
                            },
                        ],
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
                    children: {
                        columns: {
                            id: { $data_type: 'int' },
                            parent_id: { $data_type: 'int' },
                        },
                        database_type: 'mysql',
                        foreign_keys: [
                            {
                                $columns: ['parent_id'],
                                $references: {
                                    $table: 'parents',
                                    $columns: ['id'],
                                },
                            },
                        ],
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
                },
                cache: {
                    reversed_foreign_keys: {
                        grandparents: [
                            {
                                from_columns: 'id',
                                to_table: 'parents',
                                to_columns: 'grandparent_id',
                            },
                        ],
                        parents: [
                            {
                                from_columns: 'id',
                                to_table: 'children',
                                to_columns: 'parent_id',
                            },
                        ],
                    },
                },
            }

            const connection_paths = get_upwards_connection_edges(schema)

            expect(connection_paths).to.deep.equal({
                parents: [
                    {
                        from_table: 'parents',
                        from_column: 'grandparent_id',
                        to_table: 'grandparents',
                        to_column: 'id',
                    },
                ],
                children: [
                    {
                        from_table: 'children',
                        from_column: 'parent_id',
                        to_table: 'parents',
                        to_column: 'id',
                    },
                ],
            })
        })
        test('handles multiple edges', () => {
            const schema: OrmaSchema = {
                tables: {
                    parents: {
                        columns: { id: { $data_type: 'int' } },
                        database_type: 'mysql',
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
                    parents_2: {
                        columns: { id: { $data_type: 'int' } },
                        database_type: 'mysql',
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
                    children: {
                        columns: {
                            id: { $data_type: 'int' },
                            parent_id: { $data_type: 'int' },
                            parents_2_id: { $data_type: 'int' },
                        },
                        database_type: 'mysql',
                        foreign_keys: [
                            {
                                $columns: ['parent_id'],
                                $references: {
                                    $table: 'parents',
                                    $columns: ['id'],
                                },
                            },
                            {
                                $columns: ['parents_2_id'],
                                $references: {
                                    $table: 'parents_2',
                                    $columns: ['id'],
                                },
                            },
                        ],
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
                },
                cache: {
                    reversed_foreign_keys: {
                        parents: [
                            {
                                from_columns: 'id',
                                to_table: 'children',
                                to_columns: 'parent_id',
                            },
                        ],
                        parents_2: [
                            {
                                from_columns: 'id',
                                to_table: 'children',
                                to_columns: 'parents_2_id',
                            },
                        ],
                    },
                },
            }

            const connection_paths = get_upwards_connection_edges(schema)

            expect(connection_paths).to.deep.equal({
                children: [
                    {
                        from_table: 'children',
                        from_column: 'parent_id',
                        to_table: 'parents',
                        to_column: 'id',
                    },
                    {
                        from_table: 'children',
                        from_column: 'parents_2_id',
                        to_table: 'parents_2',
                        to_column: 'id',
                    },
                ],
            })
        })
        test('skips edges from an table to itself', () => {
            const schema: OrmaSchema = {
                tables: {
                    table: {
                        columns: {
                            id: { $data_type: 'int' },
                            table_id: { $data_type: 'int' },
                        },
                        database_type: 'mysql',
                        foreign_keys: [
                            {
                                $columns: ['table_id'],
                                $references: {
                                    $table: 'table',
                                    $columns: ['id'],
                                },
                            },
                        ],
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
                },
                cache: {
                    reversed_foreign_keys: {
                        table: [
                            {
                                from_columns: 'id',
                                to_table: 'table',
                                to_columns: 'table_id',
                            },
                        ],
                    },
                },
            }

            const connection_paths = get_upwards_connection_edges(schema)

            expect(connection_paths).to.deep.equal({})
        })
    })
    describe(apply_where_connected_macro.name, () => {
        test('handles nested tables', () => {
            const query = {
                $where_connected: [
                    {
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
                ],
                comments: {
                    id: true,
                },
            }

            apply_where_connected_macro(global_test_schema, query, {
                comments: [
                    {
                        from_column: 'post_id',
                        to_table: 'posts',
                        to_column: 'id',
                    },
                ],
                posts: [
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.comments.$where).to.deep.equal({
                $in: [
                    'post_id',
                    {
                        $select: ['id'],
                        $from: 'posts',
                        $where: {
                            $in: [
                                'user_id',
                                {
                                    $select: ['id'],
                                    $from: 'users',
                                    $where: {
                                        $in: ['id', [1, 2]],
                                    },
                                },
                            ],
                        },
                    },
                ],
            })
        })
        test('handles multiple connection paths', () => {
            const query = {
                $where_connected: [
                    {
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
                ],
                likes: {
                    id: true,
                },
            }

            apply_where_connected_macro(global_test_schema, query, {
                likes: [
                    {
                        from_column: 'post_id',
                        to_table: 'posts',
                        to_column: 'id',
                    },
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
                posts: [
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.likes.$where).to.deep.equal({
                $or: [
                    {
                        $in: [
                            'user_id',
                            {
                                $select: ['id'],
                                $from: 'users',
                                $where: {
                                    $in: ['id', [1, 2]],
                                },
                            },
                        ],
                    },
                    {
                        $in: [
                            'post_id',
                            {
                                $select: ['id'],
                                $from: 'posts',
                                $where: {
                                    $in: [
                                        'user_id',
                                        {
                                            $select: ['id'],
                                            $from: 'users',
                                            $where: {
                                                $in: ['id', [1, 2]],
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                ],
            })
        })
        test('combines with existing $where clause', () => {
            const query = {
                $where_connected: [
                    {
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
                ],
                posts: {
                    id: true,
                    $where: {
                        $eq: ['id', 13],
                    },
                },
            }

            // notice we are using backwards nesting here, this is supported for example if the user specified
            // some backwards parent -> child connections to add to the child -> parent ones generated by orma
            apply_where_connected_macro(global_test_schema, query, {
                posts: [
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.posts.$where).to.deep.equal({
                $and: [
                    {
                        $eq: ['id', 13],
                    },
                    {
                        $in: [
                            'user_id',
                            {
                                $select: ['id'],
                                $from: 'users',
                                $where: {
                                    $in: ['id', [1, 2]],
                                },
                            },
                        ],
                    },
                ],
            })
        })
        test('applies to $where $in clauses', () => {
            const query = {
                $where_connected: [
                    {
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
                ],
                comments: {
                    id: true,
                    $where: {
                        and: [
                            {
                                $in: [
                                    'post_id',
                                    {
                                        $select: ['id'],
                                        $from: 'posts',
                                    },
                                ],
                            },
                        ],
                    },
                },
            }

            apply_where_connected_macro(global_test_schema, query, {
                posts: [
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.comments.$where.and[0].$in[1].$where).to.deep.equal({
                $in: [
                    'user_id',
                    {
                        $select: ['id'],
                        $from: 'users',
                        $where: {
                            $in: ['id', [1, 2]],
                        },
                    },
                ],
            })
        })
        test.skip('skips regularly nested subqueries', () => {
            // add this test back after properly considering the optimization
            // in all cases (i.e. reverse nesting)
            const query = {
                $where_connected: [
                    {
                        $table: 'grandparents',
                        $column: 'id',
                        $values: [1, 2],
                    },
                ],
                parents: {
                    id: true,
                    children: {
                        id: true,
                    },
                },
            }

            // notice we are using backwards nesting here, this is supported for example if the user specified
            // some backwards parent -> child connections to add to the child -> parent ones generated by orma
            apply_where_connected_macro(global_test_schema, query, {
                children: [
                    {
                        from_column: 'parent_id',
                        to_table: 'parents',
                        to_column: 'id',
                    },
                ],
                parents: [
                    {
                        from_column: 'grandparent_id',
                        to_table: 'grandparents',
                        to_column: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.parents.$where).to.not.equal(undefined)
            // @ts-ignore
            expect(query.parents.children.$where).to.equal(undefined)
        })
        test('applies where connected to the table itself', () => {
            const query = {
                $where_connected: [
                    {
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
                ],
                users: {
                    id: true,
                },
            }

            // notice we are using backwards nesting here, this is supported for example if the user specified
            // some backwards parent -> child connections to add to the child -> parent ones generated by orma
            apply_where_connected_macro(global_test_schema, query, {})

            // @ts-ignore
            expect(query.users.$where).to.deep.equal({
                $in: ['id', [1, 2]],
            })
        })
        test('handles nullable foreign keys', () => {
            const query = {
                $where_connected: [
                    {
                        $table: 'addresses',
                        $column: 'id',
                        $values: [1, 2],
                    },
                ],
                users: {
                    id: true,
                },
            }

            apply_where_connected_macro(global_test_schema, query, {
                users: [
                    {
                        from_column: 'billing_address_id',
                        to_table: 'addresses',
                        to_column: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.users.$where).to.deep.equal({
                $or: [
                    {
                        $in: [
                            'billing_address_id',
                            {
                                $select: ['id'],
                                $from: 'addresses',
                                $where: { $in: ['id', [1, 2]] },
                            },
                        ],
                    },
                    {
                        $not: {
                            $coalesce: [
                                {
                                    $in: [
                                        'billing_address_id',
                                        {
                                            $select: ['id'],
                                            $from: 'addresses',
                                        },
                                    ],
                                },
                                false,
                            ],
                        },
                    },
                ],
            })
        })
        test('handles reversed nullable foreign keys', () => {
            const query = {
                $where_connected: [
                    {
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
                ],
                addresses: {
                    id: true,
                },
            }

            apply_where_connected_macro(global_test_schema, query, {
                addresses: [
                    {
                        from_column: 'id',
                        to_table: 'users',
                        to_column: 'billing_address_id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.addresses.$where).to.deep.equal({
                $or: [
                    {
                        $in: [
                            'id',
                            {
                                $select: ['billing_address_id'],
                                $from: 'users',
                                $where: { $in: ['id', [1, 2]] },
                            },
                        ],
                    },
                    {
                        $not: {
                            $coalesce: [
                                {
                                    $in: [
                                        'id',
                                        {
                                            $select: ['billing_address_id'],
                                            $from: 'users',
                                        },
                                    ],
                                },
                                false,
                            ],
                        },
                    },
                ],
            })
        })
        test('handles nullable and non-nullable foreign keys together', () => {
            const schema: OrmaSchema = {
                ...global_test_schema,
                tables: {
                    ...global_test_schema.$tables,
                    likes: {
                        ...global_test_schema.$tables.likes,
                        columns: {
                            ...global_test_schema.$tables.likes.$columns,
                            user_id: { $data_type: 'int' }, // make nullable
                        },
                    },
                },
            }

            const query = {
                $where_connected: [
                    {
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
                ],
                likes: {
                    id: true,
                },
            }

            apply_where_connected_macro(schema, query, {
                likes: [
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                    {
                        from_column: 'post_id',
                        to_table: 'posts',
                        to_column: 'id',
                    },
                ],
                posts: [
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.likes.$where).to.deep.equal({
                $or: [
                    {
                        $in: [
                            'user_id',
                            {
                                $select: ['id'],
                                $from: 'users',
                                $where: { $in: ['id', [1, 2]] },
                            },
                        ],
                    },
                    {
                        $in: [
                            'post_id',
                            {
                                $select: ['id'],
                                $from: 'posts',
                                $where: {
                                    $in: [
                                        'user_id',
                                        {
                                            $select: ['id'],
                                            $from: 'users',
                                            $where: { $in: ['id', [1, 2]] },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                ],
            })
        })
        test('handles no connection paths', () => {
            const query = {
                $where_connected: [
                    {
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
                ],
                posts: {
                    id: true,
                },
            }

            apply_where_connected_macro(global_test_schema, query, {})

            // @ts-ignore
            expect(query.posts.$where).to.equal(undefined)
        })
        test('handles no $where_connected', () => {
            const query = {}
            apply_where_connected_macro(global_test_schema, query, {})
            expect(query).to.deep.equal({})
        })
    })
    describe(restrict_where_connected.name, () => {
        test('defaults to the restriction', () => {
            const query = {}
            const restrictions = [
                { $table: 'posts', $column: 'id', $values: [1, 2] },
            ]
            const errors = restrict_where_connected(query, restrictions)

            expect(errors).to.deep.equal([])
            //@ts-ignore
            expect(query.$where_connected).to.deep.equal(restrictions)
        })
        test('generates an error if values are not in the restriction', () => {
            const query = {
                $where_connected: [
                    { $table: 'posts', $column: 'id', $values: [1, 3] },
                ],
            }
            const restrictions = [
                { $table: 'posts', $column: 'id', $values: [1, 2] },
            ]
            const input_query = clone(query)
            const errors = restrict_where_connected(input_query, restrictions)

            expect(input_query).to.deep.equal(query) // shouldnt mutate the query
            expect(errors.length).to.equal(1)
        })
        test('ignores where connecteds not in the restriction', () => {
            const query = {
                $where_connected: [
                    {
                        // this one is ignored since the $column is different to the restriction
                        $table: 'posts',
                        $column: 'user_id',
                        $values: [5],
                    },
                    {
                        $table: 'posts',
                        $column: 'id',
                        $values: [1],
                    },
                ],
            }
            const restrictions = [
                { $table: 'posts', $column: 'id', $values: [1, 2] },
            ]
            const input_query = clone(query)
            const errors = restrict_where_connected(input_query, restrictions)

            expect(input_query).to.deep.equal(query) // shouldnt mutate the query
            expect(errors).to.deep.equal([])
        })
    })
    test.skip('handles nullalbe foreign keys')
    test.skip(
        'considered yours if it belongs to multiple vendors including you (e.g. you can view an order even though other vendors oreder itesm are inside)'
    )
})
