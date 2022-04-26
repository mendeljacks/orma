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

    describe.only(get_upwards_connection_paths.name, () => {
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

    describe(apply_where_connected_macro.name, () => {
        test('handles nested entities', () => {
            const query = {
                $where_connected: {
                    grandparents: {
                        id: [1, 2],
                    },
                },
                children: {
                    id: true,
                },
            }

            apply_where_connected_macro(query, {
                children: [
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
            })

            // @ts-ignore
            expect(query.children.$where).to.deep.equal({
                $in: [
                    'parent_id',
                    {
                        $select: ['id'],
                        $from: 'parents',
                        $where: {
                            // we dont need another layer of nesting since we are filtering against grandparents.id which
                            // is guaranteed to match parents.grandparent_id since it has a foreign key
                            $in: ['grandparent_id', [1, 2]],
                        },
                    },
                ],
            })
        })
        test.skip('handles nesting for tables without connection paths')
    })
})
