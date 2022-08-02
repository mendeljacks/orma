import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import { as_orma_schema } from '../query'
import {
    apply_where_connected_macro,
    get_edge_paths_by_destination,
    get_upwards_connection_edges,
} from './where_connected_macro'

describe('where_connected_macro.ts', () => {
    const schema = as_orma_schema({
        grandparents: {
            id: {
                not_null: true,
            },
        },
        nullable_entity: {
            id: {
                not_null: true,
            },
            grandparent_id: {
                references: {
                    grandparents: {
                        id: {},
                    },
                },
            },
        },
        parents: {
            id: {
                not_null: true,
            },
            grandparent_id: {
                not_null: true,
                references: {
                    grandparents: {
                        id: {},
                    },
                },
            },
        },
        parents_2: {
            id: {
                not_null: true,
            },
            grandparent_id: {
                not_null: true,
                references: {
                    grandparents: {
                        id: {},
                    },
                },
            },
        },
        children: {
            id: {
                not_null: true,
            },
            parent_id: {
                not_null: true,
                references: {
                    parents_1: {
                        id: {},
                    },
                },
            },
            parents_2_id: {
                not_null: true,
                references: {
                    parents_2: {
                        id: {},
                    },
                },
            },
        },
    })

    describe(get_upwards_connection_edges.name, () => {
        test('handles multiple entities', () => {
            const schema: OrmaSchema = {
                grandparents: {
                    id: {},
                },
                parents: {
                    id: {},
                    grandparent_id: {
                        references: {
                            grandparents: {
                                id: {},
                            },
                        },
                    },
                },
                children: {
                    id: {},
                    parent_id: {
                        references: {
                            parents: {
                                id: {},
                            },
                        },
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
                parents: {
                    id: {},
                },
                parents_2: {
                    id: {},
                },
                children: {
                    id: {},
                    parent_id: {
                        references: {
                            parents: {
                                id: {},
                            },
                        },
                    },
                    parents_2_id: {
                        references: {
                            parents_2: {
                                id: {},
                            },
                        },
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
                entity: {
                    id: {},
                    entity_id: {
                        references: {
                            entity: {
                                id: {},
                            },
                        },
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
                $and: [
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
                        $entity: 'children',
                        $field: 'id',
                        $values: [1, 2],
                    },
                ],
                parents: {
                    id: true,
                    $where: {
                        $eq: ['id', 13],
                    },
                },
            }

            // notice we are using backwards nesting here, this is supported for example if the user specified
            // some backwards parent -> child connections to add to the child -> parent ones generated by orma
            apply_where_connected_macro(schema, query, {
                parents: [
                    {
                        from_field: 'id',
                        to_entity: 'children',
                        to_field: 'parent_id',
                    },
                ],
            })

            // @ts-ignore
            expect(query.parents.$where).to.deep.equal({
                $and: [
                    {
                        $eq: ['id', 13],
                    },
                    {
                        $in: [
                            'id',
                            {
                                $select: ['parent_id'],
                                $from: 'children',
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
        test('handles nullable foreign key', () => {
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
                                $where: {
                                    $in: ['id', [1, 2]],
                                },
                            },
                        ],
                    },
                    {
                        $eq: ['grandparent_id', null],
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
    test.skip('handles nullalbe foreign keys')
    test.skip(
        'considered yours if it belongs to multiple vendors including you (e.g. you can view an order even though other vendors oreder itesm are inside)'
    )
})
