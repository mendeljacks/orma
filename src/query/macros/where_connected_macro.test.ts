import { expect } from 'chai'
import { describe, test } from 'mocha'
import { orma_schema } from '../../introspector/introspector'
import { as_orma_schema } from '../query'
import {
    apply_where_connected_macro,
    get_upwards_connection_paths,
} from './where_connected_macro'

describe.only('where_connected_macro.ts', () => {
    const schema = as_orma_schema({
        grandparents: {
            id: {
                not_null: true,
                primary_key: true,
            },
        },
        parents: {
            id: {
                not_null: true,
                primary_key: true,
            },
            grandparent_id: {
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
    })

    describe(get_upwards_connection_paths.name, () => {
        test('generates nested paths', () => {
            const schema: orma_schema = {
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

            const connection_paths = get_upwards_connection_paths(schema)

            expect(connection_paths.children.grandparents).to.deep.equal([
                [
                    {
                        from_entity: 'children',
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id',
                    },
                    {
                        from_entity: 'parents',
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                ],
            ])
        })
        test('handles mutiple ways to get to same entity', () => {
            const schema: orma_schema = {
                grandparents: {
                    id: {},
                },
                parents_1: {
                    id: {},
                    grandparent_id: {
                        references: {
                            grandparents: {
                                id: {},
                            },
                        },
                    },
                },
                parents_2: {
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
                    parent_1_id: {
                        references: {
                            parents_1: {
                                id: {},
                            },
                        },
                    },
                    parent_2_id: {
                        references: {
                            parents_2: {
                                id: {},
                            },
                        },
                    },
                },
            }

            const connection_paths = get_upwards_connection_paths(schema)

            expect(connection_paths.children.grandparents).to.deep.equal([
                [
                    {
                        from_entity: 'children',
                        from_field: 'parent_1_id',
                        to_entity: 'parents_1',
                        to_field: 'id',
                    },
                    {
                        from_entity: 'parents_1',
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                ],
                [
                    {
                        from_entity: 'children',
                        from_field: 'parent_2_id',
                        to_entity: 'parents_2',
                        to_field: 'id',
                    },
                    {
                        from_entity: 'parents_2',
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id',
                    },
                ],
            ])
        })
        test('ignores children', () => {
            const schema: orma_schema = {
                parents: {
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
                },
            }

            const connection_paths = get_upwards_connection_paths(schema)

            expect(connection_paths.parents).to.equal(undefined)
        })
    })
    describe.only(apply_where_connected_macro.name, () => {
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

            apply_where_connected_macro(query, {
                children: {
                    grandparents: [
                        [
                            {
                                from_entity: 'children',
                                from_field: 'parent_id',
                                to_entity: 'parents',
                                to_field: 'id',
                            },
                            {
                                from_entity: 'parents',
                                from_field: 'grandparent_id',
                                to_entity: 'grandparents',
                                to_field: 'id',
                            },
                        ],
                    ],
                },
            })

            // @ts-ignore
            expect(query.children.$where).to.deep.equal({
                $in: [
                    'parent_id',
                    {
                        $select: ['id'],
                        $from: 'parents',
                        $where: {
                            $in: ['grandparent_id', {
                                $select: ['id'],
                                $from: 'grandparents',
                                $where: {
                                    $in: ['id', [1, 2]]
                                }
                            }],
                        },
                    },
                ],
            })
        })
        test('handles nesting for tables without connection paths', () => {
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

            apply_where_connected_macro(query, { })

            // @ts-ignore
            expect(query.children.$where).to.equal(undefined)
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

            apply_where_connected_macro(query, {
                children: {
                    grandparents: [
                        [
                            {
                                from_entity: 'children',
                                from_field: 'parent_1_id',
                                to_entity: 'parents_1',
                                to_field: 'id',
                            },
                            {
                                from_entity: 'parents_1',
                                from_field: 'grandparent_id',
                                to_entity: 'grandparents',
                                to_field: 'id',
                            },
                        ],
                        [
                            {
                                from_entity: 'children',
                                from_field: 'parent_2_id',
                                to_entity: 'parents_2',
                                to_field: 'id',
                            },
                            {
                                from_entity: 'parents_2',
                                from_field: 'grandparent_id',
                                to_entity: 'grandparents',
                                to_field: 'id',
                            },
                        ],
                    ],
                },
            })

            // @ts-ignore
            expect(query.children.$where).to.deep.equal({
                $and: [{
                    $in: [
                        'parent_1_id',
                        {
                            $select: ['id'],
                            $from: 'parents_1',
                            $where: {
                                $in: ['grandparent_id', {
                                    $select: ['id'],
                                    $from: 'grandparents',
                                    $where: {
                                        $in: ['id', [1, 2]]
                                    }
                                }],
                            },
                        },
                    ],
                }, {
                    $in: [
                        'parent_2_id',
                        {
                            $select: ['id'],
                            $from: 'parents_2',
                            $where: {
                                $in: ['grandparent_id', {
                                    $select: ['id'],
                                    $from: 'grandparents',
                                    $where: {
                                        $in: ['id', [1, 2]]
                                    }
                                }],
                            },
                        },
                    ],
                }]
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
                        $eq: ['id', 13]
                    }
                },
            }

            apply_where_connected_macro(query, {
                children: {
                    parents: [
                        [
                            {
                                from_entity: 'children',
                                from_field: 'parent_id',
                                to_entity: 'parents',
                                to_field: 'id',
                            }
                        ],
                    ],
                },
            })

            // @ts-ignore
            expect(query.children.$where).to.deep.equal({
                $and: [{
                    $eq: ['id', 13]
                }, {
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
                }]
            })
        })
        test('applies to $where $in clauses', () => {
            
        })
        test.skip('skips regularly nested subqueries')
        test.skip('skips regularly nested $where $in clauses')
        test('handles no $where_connected', () => {
            const query = {}
            apply_where_connected_macro(query, {})
            expect(query).to.deep.equal({})
        })
    })
})
