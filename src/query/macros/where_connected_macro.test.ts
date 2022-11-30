import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../../helpers/helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { WhereConnected } from '../../types/query/query_types'
import { as_orma_schema } from '../query'
import {
    apply_where_connected_macro,
    get_edge_paths_by_destination,
    get_upwards_connection_edges,
    restrict_where_connected,
} from './where_connected_macro'

describe('where_connected_macro.ts', () => {
    const schema = as_orma_schema({
        $entities: {
            grandparents: {
                $fields: { id: { not_null: true } },
                $database_type: 'mysql',
            },
            nullable_entity: {
                $fields: {
                    id: { not_null: true },
                    grandparent_id: {},
                    parent_id: { not_null: true },
                },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                    {
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id',
                    },
                ],
            },
            parents: {
                $fields: {
                    id: { not_null: true },
                    grandparent_id: { not_null: true },
                },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                ],
            },
            parents_2: {
                $fields: {
                    id: { not_null: true },
                    grandparent_id: { not_null: true },
                },
                $database_type: 'mysql',
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
                    id: { not_null: true },
                    parent_id: { not_null: true },
                    parents_2_id: { not_null: true },
                },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'parent_id',
                        to_entity: 'parents_1',
                        to_field: 'id',
                    },
                    {
                        from_field: 'parents_2_id',
                        to_entity: 'parents_2',
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
                        to_entity: 'nullable_entity',
                        to_field: 'grandparent_id',
                    },
                    {
                        from_field: 'id',
                        to_entity: 'parents',
                        to_field: 'grandparent_id',
                    },
                    {
                        from_field: 'id',
                        to_entity: 'parents_2',
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
                        to_entity: 'nullable_entity',
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
    })

    describe(get_upwards_connection_edges.name, () => {
        test('handles multiple entities', () => {
            const schema: OrmaSchema = {
                $entities: {
                    grandparents: {
                        $fields: { id: {} },
                        $database_type: 'mysql',
                    },
                    parents: {
                        $fields: { id: {}, grandparent_id: {} },
                        $database_type: 'mysql',
                        $foreign_keys: [
                            {
                                from_field: 'grandparent_id',
                                to_entity: 'grandparents',
                                to_field: 'id',
                            },
                        ],
                    },
                    children: {
                        $fields: { id: {}, parent_id: {} },
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
                    parents: { $fields: { id: {} }, $database_type: 'mysql' },
                    parents_2: { $fields: { id: {} }, $database_type: 'mysql' },
                    children: {
                        $fields: { id: {}, parent_id: {}, parents_2_id: {} },
                        $database_type: 'mysql',
                        $foreign_keys: [
                            {
                                from_field: 'parent_id',
                                to_entity: 'parents',
                                to_field: 'id',
                            },
                            {
                                from_field: 'parents_2_id',
                                to_entity: 'parents_2',
                                to_field: 'id',
                            },
                        ],
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
                        $fields: { id: {}, entity_id: {} },
                        $database_type: 'mysql',
                        $foreign_keys: [
                            {
                                from_field: 'entity_id',
                                to_entity: 'entity',
                                to_field: 'id',
                            },
                        ],
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
                        $entity: 'grandparents',
                        $field: 'id',
                        $values: [1, 2],
                    },
                ],
                children: {
                    id: true,
                },
            }

            apply_where_connected_macro(schema, query, {
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
            expect(query.children.$where).to.deep.equal({
                $in: [
                    'parent_id',
                    {
                        $select: ['id'],
                        $from: 'parents',
                        $where: {
                            $in: [
                                'grandparent_id',
                                {
                                    $select: ['id'],
                                    $from: 'grandparents',
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
                        $entity: 'grandparents',
                        $field: 'id',
                        $values: [1, 2],
                    },
                ],
                children: {
                    id: true,
                },
            }

            apply_where_connected_macro(schema, query, {
                children: [
                    {
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id',
                    },
                    {
                        from_field: 'parents_2_id',
                        to_entity: 'parents_2',
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
                parents_2: [
                    {
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.children.$where).to.deep.equal({
                $or: [
                    {
                        $in: [
                            'parent_id',
                            {
                                $select: ['id'],
                                $from: 'parents',
                                $where: {
                                    $in: [
                                        'grandparent_id',
                                        {
                                            $select: ['id'],
                                            $from: 'grandparents',
                                            $where: {
                                                $in: ['id', [1, 2]],
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                    {
                        $in: [
                            'parents_2_id',
                            {
                                $select: ['id'],
                                $from: 'parents_2',
                                $where: {
                                    $in: [
                                        'grandparent_id',
                                        {
                                            $select: ['id'],
                                            $from: 'grandparents',
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
                        $entity: 'parents',
                        $field: 'id',
                        $values: [1, 2],
                    },
                ],
                children: {
                    id: true,
                    $where: {
                        $eq: ['id', 13],
                    },
                },
            }

            // notice we are using backwards nesting here, this is supported for example if the user specified
            // some backwards parent -> child connections to add to the child -> parent ones generated by orma
            apply_where_connected_macro(schema, query, {
                children: [
                    {
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.children.$where).to.deep.equal({
                $and: [
                    {
                        $eq: ['id', 13],
                    },
                    {
                        $in: [
                            'parent_id',
                            {
                                $select: ['id'],
                                $from: 'parents',
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
                        $entity: 'grandparents',
                        $field: 'id',
                        $values: [1, 2],
                    },
                ],
                children: {
                    id: true,
                    $where: {
                        and: [
                            {
                                $in: [
                                    'parent_id',
                                    {
                                        $select: ['id'],
                                        $from: 'parents',
                                    },
                                ],
                            },
                        ],
                    },
                },
            }

            apply_where_connected_macro(schema, query, {
                parents: [
                    {
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.children.$where.and[0].$in[1].$where).to.deep.equal({
                $in: [
                    'grandparent_id',
                    {
                        $select: ['id'],
                        $from: 'grandparents',
                        $where: {
                            $in: ['id', [1, 2]],
                        },
                    },
                ],
            })
        })
        test('skips regularly nested subqueries', () => {
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
            apply_where_connected_macro(schema, query, {
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
                        $entity: 'parents',
                        $field: 'id',
                        $values: [1, 2],
                    },
                ],
                parents: {
                    id: true,
                },
            }

            // notice we are using backwards nesting here, this is supported for example if the user specified
            // some backwards parent -> child connections to add to the child -> parent ones generated by orma
            apply_where_connected_macro(schema, query, {})

            // @ts-ignore
            expect(query.parents.$where).to.deep.equal({
                $in: ['id', [1, 2]],
            })
        })
        test('handles nullable foreign keys', () => {
            const query = {
                $where_connected: [
                    {
                        $entity: 'grandparents',
                        $field: 'id',
                        $values: [1, 2],
                    },
                ],
                nullable_entity: {
                    id: true,
                },
            }

            apply_where_connected_macro(schema, query, {
                nullable_entity: [
                    {
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                ]
            })

            // @ts-ignore
            expect(query.nullable_entity.$where).to.deep.equal({
                $or: [
                    {
                        $in: [
                            'grandparent_id',
                            {
                                $select: ['id'],
                                $from: 'grandparents',
                                $where: { $in: ['id', [1, 2]] },
                            },
                        ],
                    },
                    {
                        $not: {
                            $in: [
                                'grandparent_id',
                                {
                                    $select: ['id'],
                                    $from: 'grandparents'
                                },
                            ],
                        }
                    }
                ],
            })
        })
        test('handles nullable and non-nullable foreign keys together', () => {
            const query = {
                $where_connected: [
                    {
                        $entity: 'grandparents',
                        $field: 'id',
                        $values: [1, 2],
                    },
                ],
                nullable_entity: {
                    id: true,
                },
            }

            apply_where_connected_macro(schema, query, {
                nullable_entity: [
                    {
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
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
                    {
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.nullable_entity.$where).to.deep.equal({
                $or: [
                    {
                        $in: [
                            'grandparent_id',
                            {
                                $select: ['id'],
                                $from: 'grandparents',
                                $where: { $in: ['id', [1, 2]] },
                            },
                        ],
                    },
                    {
                        $in: [
                            'parent_id',
                            {
                                $select: ['id'],
                                $from: 'parents',
                                $where: {
                                    $in: [
                                        'grandparent_id',
                                        {
                                            $select: ['id'],
                                            $from: 'grandparents',
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
                        $entity: 'grandparents',
                        $field: 'id',
                        $values: [1, 2],
                    },
                ],
                children: {
                    id: true,
                },
            }

            apply_where_connected_macro(schema, query, {})

            // @ts-ignore
            expect(query.children.$where).to.equal(undefined)
        })
        test('handles no $where_connected', () => {
            const query = {}
            apply_where_connected_macro(schema, query, {})
            expect(query).to.deep.equal({})
        })
    })
    describe(restrict_where_connected.name, () => {
        test('defaults to the restriction', () => {
            const query = {}
            const restrictions = [
                { $entity: 'parents', $field: 'id', $values: [1, 2] },
            ]
            const errors = restrict_where_connected(query, restrictions)

            expect(errors).to.deep.equal([])
            //@ts-ignore
            expect(query.$where_connected).to.deep.equal(restrictions)
        })
        test('generates an error if values are not in the restriction', () => {
            const query = {
                $where_connected: [
                    { $entity: 'parents', $field: 'id', $values: [1, 3] },
                ],
            }
            const restrictions = [
                { $entity: 'parents', $field: 'id', $values: [1, 2] },
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
                        $entity: 'parents',
                        $field: 'grandparent_id',
                        $values: [5],
                    },
                    {
                        $entity: 'parents',
                        $field: 'id',
                        $values: [1],
                    },
                ],
            }
            const restrictions = [
                { $entity: 'parents', $field: 'id', $values: [1, 2] },
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
