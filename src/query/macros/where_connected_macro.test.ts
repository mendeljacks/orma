import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../../helpers/helpers'
import { global_test_schema } from '../../test_data/global_test_schema'
import { OrmaSchema } from '../../types/schema/schema_types'
import {
    apply_where_connected_macro,
    get_upwards_connection_edges,
    restrict_where_connected,
} from './where_connected_macro'

describe('where_connected_macro.ts', () => {
    describe(get_upwards_connection_edges.name, () => {
        test('handles multiple entities', () => {
            const schema: OrmaSchema = {
                $entities: {
                    grandparents: {
                        $fields: { id: { $data_type: 'int' } },
                        $database_type: 'mysql',
                        $primary_key: {
                            $fields: ['id'],
                        },
                    },
                    parents: {
                        $fields: {
                            id: { $data_type: 'int' },
                            grandparent_id: { $data_type: 'int' },
                        },
                        $database_type: 'mysql',
                        $foreign_keys: [
                            {
                                $fields: ['grandparent_id'],
                                $references: {
                                    $entity: 'grandparents',
                                    $fields: ['id'],
                                },
                            },
                        ],
                        $primary_key: {
                            $fields: ['id'],
                        },
                    },
                    children: {
                        $fields: {
                            id: { $data_type: 'int' },
                            parent_id: { $data_type: 'int' },
                        },
                        $database_type: 'mysql',
                        $foreign_keys: [
                            {
                                $fields: ['parent_id'],
                                $references: {
                                    $entity: 'parents',
                                    $fields: ['id'],
                                },
                            },
                        ],
                        $primary_key: {
                            $fields: ['id'],
                        },
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
                        ],
                    },
                },
            }

            const connection_paths = get_upwards_connection_edges(schema)

            expect(connection_paths).to.deep.equal({
                parents: [
                    {
                        from_entity: 'parents',
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                ],
                children: [
                    {
                        from_entity: 'children',
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id',
                    },
                ],
            })
        })
        test('handles multiple edges', () => {
            const schema: OrmaSchema = {
                $entities: {
                    parents: {
                        $fields: { id: { $data_type: 'int' } },
                        $database_type: 'mysql',
                        $primary_key: {
                            $fields: ['id'],
                        },
                    },
                    parents_2: {
                        $fields: { id: { $data_type: 'int' } },
                        $database_type: 'mysql',
                        $primary_key: {
                            $fields: ['id'],
                        },
                    },
                    children: {
                        $fields: {
                            id: { $data_type: 'int' },
                            parent_id: { $data_type: 'int' },
                            parents_2_id: { $data_type: 'int' },
                        },
                        $database_type: 'mysql',
                        $foreign_keys: [
                            {
                                $fields: ['parent_id'],
                                $references: {
                                    $entity: 'parents',
                                    $fields: ['id'],
                                },
                            },
                            {
                                $fields: ['parents_2_id'],
                                $references: {
                                    $entity: 'parents_2',
                                    $fields: ['id'],
                                },
                            },
                        ],
                        $primary_key: {
                            $fields: ['id'],
                        },
                    },
                },
                $cache: {
                    $reversed_foreign_keys: {
                        parents: [
                            {
                                from_field: 'id',
                                to_entity: 'children',
                                to_field: 'parent_id',
                            },
                        ],
                        parents_2: [
                            {
                                from_field: 'id',
                                to_entity: 'children',
                                to_field: 'parents_2_id',
                            },
                        ],
                    },
                },
            }

            const connection_paths = get_upwards_connection_edges(schema)

            expect(connection_paths).to.deep.equal({
                children: [
                    {
                        from_entity: 'children',
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id',
                    },
                    {
                        from_entity: 'children',
                        from_field: 'parents_2_id',
                        to_entity: 'parents_2',
                        to_field: 'id',
                    },
                ],
            })
        })
        test('skips edges from an entity to itself', () => {
            const schema: OrmaSchema = {
                $entities: {
                    entity: {
                        $fields: {
                            id: { $data_type: 'int' },
                            entity_id: { $data_type: 'int' },
                        },
                        $database_type: 'mysql',
                        $foreign_keys: [
                            {
                                $fields: ['entity_id'],
                                $references: {
                                    $entity: 'entity',
                                    $fields: ['id'],
                                },
                            },
                        ],
                        $primary_key: {
                            $fields: ['id'],
                        },
                    },
                },
                $cache: {
                    $reversed_foreign_keys: {
                        entity: [
                            {
                                from_field: 'id',
                                to_entity: 'entity',
                                to_field: 'entity_id',
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
        test('handles nested entities', () => {
            const query = {
                $where_connected: [
                    {
                        $entity: 'users',
                        $field: 'id',
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
                        from_field: 'post_id',
                        to_entity: 'posts',
                        to_field: 'id',
                    },
                ],
                posts: [
                    {
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id',
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
                        $entity: 'users',
                        $field: 'id',
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
                        from_field: 'post_id',
                        to_entity: 'posts',
                        to_field: 'id',
                    },
                    {
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id',
                    },
                ],
                posts: [
                    {
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id',
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
                        $entity: 'users',
                        $field: 'id',
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
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id',
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
                        $entity: 'users',
                        $field: 'id',
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
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id',
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
                        $entity: 'grandparents',
                        $field: 'id',
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
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id',
                    },
                ],
                parents: [
                    {
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.parents.$where).to.not.equal(undefined)
            // @ts-ignore
            expect(query.parents.children.$where).to.equal(undefined)
        })
        test('applies where connected to the entity itself', () => {
            const query = {
                $where_connected: [
                    {
                        $entity: 'users',
                        $field: 'id',
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
                        $entity: 'addresses',
                        $field: 'id',
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
                        from_field: 'billing_address_id',
                        to_entity: 'addresses',
                        to_field: 'id',
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
                        $entity: 'users',
                        $field: 'id',
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
                        from_field: 'id',
                        to_entity: 'users',
                        to_field: 'billing_address_id',
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
                $entities: {
                    ...global_test_schema.$entities,
                    likes: {
                        ...global_test_schema.$entities.likes,
                        $fields: {
                            ...global_test_schema.$entities.likes.$fields,
                            user_id: { $data_type: 'int' }, // make nullable
                        },
                    },
                },
            }

            const query = {
                $where_connected: [
                    {
                        $entity: 'users',
                        $field: 'id',
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
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id',
                    },
                    {
                        from_field: 'post_id',
                        to_entity: 'posts',
                        to_field: 'id',
                    },
                ],
                posts: [
                    {
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id',
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
                        $entity: 'users',
                        $field: 'id',
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
                { $entity: 'posts', $field: 'id', $values: [1, 2] },
            ]
            const errors = restrict_where_connected(query, restrictions)

            expect(errors).to.deep.equal([])
            //@ts-ignore
            expect(query.$where_connected).to.deep.equal(restrictions)
        })
        test('generates an error if values are not in the restriction', () => {
            const query = {
                $where_connected: [
                    { $entity: 'posts', $field: 'id', $values: [1, 3] },
                ],
            }
            const restrictions = [
                { $entity: 'posts', $field: 'id', $values: [1, 2] },
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
                        // this one is ignored since the $field is different to the restriction
                        $entity: 'posts',
                        $field: 'user_id',
                        $values: [5],
                    },
                    {
                        $entity: 'posts',
                        $field: 'id',
                        $values: [1],
                    },
                ],
            }
            const restrictions = [
                { $entity: 'posts', $field: 'id', $values: [1, 2] },
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
