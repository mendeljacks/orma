import { expect } from 'chai'
import { describe, test } from 'mocha'
import {
    GlobalTestSchema,
    global_test_schema
} from '../../test_data/global_test_schema'
import {
    add_connection_edges,
    ConnectionEdges,
    get_upwards_connection_edges
} from '../../query/macros/where_connected_macro'
import { WhereConnected } from '../../types/query/query_types'
import { MysqlFunction } from '../mutate'
import { MutationPiece } from '../plan/mutation_batches'
import {
    get_foreign_key_connected_wheres,
    get_ownership_queries,
    get_identifier_connected_wheres,
    get_mutation_connected_errors
} from './mutation_connected'

describe('mutation_connected.ts', () => {
    const default_connection_edges =
        get_upwards_connection_edges(global_test_schema)

    const get_test_where_connected = (
        entity: string
    ): WhereConnected<GlobalTestSchema>[number] => ({
        $entity: entity as any,
        $field: 'id',
        $values: [1, 2]
    })

    describe(get_mutation_connected_errors.name, () => {
        test('integration test', async () => {
            const query_function: MysqlFunction = async statements => [
                [
                    {
                        id: 2
                    },
                    {
                        id: 5
                    }
                ]
            ]

            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        user_id: 2,
                        title: 'test 1'
                    },
                    path: ['posts', 0]
                },
                {
                    record: {
                        $operation: 'create',
                        user_id: 5,
                        title: 'test 2'
                    },
                    path: ['posts', 1]
                }
            ]

            const errors = await get_mutation_connected_errors(
                global_test_schema,
                default_connection_edges,
                query_function,
                new Map(),
                [get_test_where_connected('users')],
                mutation_pieces
            )
            expect(errors.length).to.equal(1)
        })
        test('works when nothing is connected to ownership entity', async () => {
            const query_function: MysqlFunction = async statements => []

            const mutation_pieces = []

            const errors = await get_mutation_connected_errors(
                global_test_schema,
                default_connection_edges,
                query_function,
                new Map(),
                [get_test_where_connected('users')],
                mutation_pieces
            )
            expect(errors).to.deep.equal([])
        })
    })
    describe(get_ownership_queries.name, () => {
        test('tracks multiple entities', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        post_id: 1,
                        category_id: 2
                    },
                    path: ['post_has_categories', 0]
                },
                {
                    record: {
                        $operation: 'update',
                        id: 3,
                        $identifying_fields: ['id']
                    },
                    path: ['comments', 0]
                }
            ]

            const ownership_queries = get_ownership_queries(
                global_test_schema,
                default_connection_edges,
                new Map(),
                [get_test_where_connected('posts')],
                mutation_pieces
            )

            expect(ownership_queries).to.deep.equal([
                {
                    $select: ['id'],
                    $from: 'posts',
                    $where: {
                        $or: [
                            { $in: ['id', [1]] },
                            {
                                $in: [
                                    'id',
                                    {
                                        $select: ['post_id'],
                                        $from: 'comments',
                                        $where: { $eq: ['id', 3] }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ])
        })
        test('handles reverse nesting ownership', () => {
            const mutation_pieces: MutationPiece[] = [
                // updating generates a where clause
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        $identifying_fields: ['id']
                    },
                    path: ['addresses', 0]
                },
                // creating does not generate a where clause here, even though there is a connection edge to products,
                // since in the create we dont include a foreign key to anything existing in the database
                {
                    record: {
                        $operation: 'create'
                    },
                    path: ['addresses', 0]
                }
            ]

            // in this examle, we set up the connection edges so that a listing is considered connected
            // to a user if one of the products connected to that listing are connected to the user
            const connection_edges = add_connection_edges(
                default_connection_edges,
                [
                    {
                        from_entity: 'addresses',
                        from_field: 'id',
                        to_entity: 'users',
                        to_field: 'shipping_address_id'
                    }
                ]
            )

            const ownership_queries = get_ownership_queries(
                global_test_schema,
                connection_edges,
                new Map(),
                [get_test_where_connected('users')],
                mutation_pieces
            )

            expect(ownership_queries).to.deep.equal([
                {
                    $select: ['id'],
                    $from: 'users',
                    $where: {
                        // there are two almost identical clauses because the foreign key column (id in this case since
                        // it is a reverse nest) is also the identifying key. We could dedupe this in future, but I'm
                        // leaving it for now
                        $or: [
                            {
                                $in: ['shipping_address_id', [1]]
                            },
                            {
                                $in: [
                                    'shipping_address_id',
                                    {
                                        $select: ['id'],
                                        $from: 'addresses',
                                        $where: {
                                            $eq: ['id', 1]
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ])
        })
        test('handles creating a child of a reverse connected entity', () => {
            const mutation_pieces: MutationPiece[] = [
                // in this case we expect that any posts connected to an already existing post_has_category
                // connected to category 1 will show up in the connected query, since category 2 is owned
                // by the posts of all existing post_has_categories
                {
                    record: {
                        $operation: 'create',
                        post_id: 1,
                        category_id: 2
                    },
                    path: ['post_has_categories', 0]
                }
            ]

            const connection_edges = add_connection_edges(
                default_connection_edges,
                [
                    {
                        from_entity: 'categories',
                        from_field: 'id',
                        to_entity: 'post_has_categories',
                        to_field: 'category_id'
                    }
                ]
            )

            const ownership_queries = get_ownership_queries(
                global_test_schema,
                connection_edges,
                new Map(),
                [get_test_where_connected('posts')],
                mutation_pieces
            )

            expect(ownership_queries).to.deep.equal([
                {
                    $select: ['id'],
                    $from: 'posts',
                    $where: {
                        $or: [
                            { $in: ['id', [1]] },
                            {
                                $in: [
                                    'id',
                                    {
                                        $select: ['post_id'],
                                        $from: 'post_has_categories',
                                        $where: {
                                            $in: [
                                                'category_id',
                                                {
                                                    $select: ['id'],
                                                    $from: 'categories',
                                                    $where: {
                                                        $in: ['id', [2]]
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ])
        })
        test('handles entity with no connected to table', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create'
                    },
                    path: ['categories', 0]
                }
            ]

            const connection_edges: ConnectionEdges = {}

            const ownership_queries = get_ownership_queries(
                global_test_schema,
                connection_edges,
                new Map(),
                [get_test_where_connected('users')],
                mutation_pieces
            )

            expect(ownership_queries).to.deep.equal([])
        })
        test('ignores $guids', () => {
            const mutation_pieces: MutationPiece[] = [
                // in this case we expect that any users connected to an already existing product connected to
                // listing 1 will show up in the connected query
                {
                    record: {
                        $operation: 'create',
                        user_id: { $guid: 2 }
                    },
                    path: ['products', 0]
                }
            ]

            const ownership_queries = get_ownership_queries(
                global_test_schema,
                default_connection_edges,
                new Map(),
                [get_test_where_connected('users')],
                mutation_pieces
            )

            expect(ownership_queries).to.deep.equal([])
        })
    })
    describe(get_identifier_connected_wheres.name, () => {
        test('tracks primary keys', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 12,
                        title: 'hi',
                        $identifying_fields: ['id']
                    },
                    path: ['posts', 0]
                }
            ]

            const wheres = get_identifier_connected_wheres(
                global_test_schema,
                default_connection_edges,
                new Map(),
                get_test_where_connected('users'),
                mutation_pieces,
                [0],
                'posts'
            )

            expect(wheres).to.deep.equal([
                {
                    $in: [
                        'id',
                        {
                            $select: ['user_id'],
                            $from: 'posts',
                            $where: { $eq: ['id', 12] }
                        }
                    ]
                }
            ])
        })
        test('handles multiple ownership paths', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        $identifying_fields: ['id']
                    },
                    path: ['users', 0]
                }
            ]

            // const connection_edges = add_connection_edges(
            //     default_connection_edges,
            //     [
            //         {
            //             from_entity: 'addresses',
            //             from_field: 'id',
            //             to_entity: 'users',
            //             to_field: 'shipping_address_id',
            //         },
            //         {
            //             from_entity: 'addresses',
            //             from_field: 'id',
            //             to_entity: 'users',
            //             to_field: 'billing_address_id',
            //         },
            //     ]
            // )

            const wheres = get_identifier_connected_wheres(
                global_test_schema,
                default_connection_edges,
                new Map(),
                get_test_where_connected('addresses'),
                mutation_pieces,
                [0],
                'users'
            )

            expect(wheres).to.deep.equal([
                {
                    $in: [
                        'id',
                        {
                            $select: ['billing_address_id'],
                            $from: 'users',
                            $where: { $eq: ['id', 1] }
                        }
                    ]
                },
                {
                    $in: [
                        'id',
                        {
                            $select: ['shipping_address_id'],
                            $from: 'users',
                            $where: { $eq: ['id', 1] }
                        }
                    ]
                }
            ])
        })
        test('handles no primary key', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        user_id: 12
                    },
                    path: ['products', 0]
                }
            ]

            const wheres = get_identifier_connected_wheres(
                global_test_schema,
                default_connection_edges,
                new Map(),
                get_test_where_connected('users'),
                mutation_pieces,
                [0],
                'products'
            )

            expect(wheres).to.deep.equal([])
        })
        test('handles no edge paths', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        user_id: 12,
                        $identifying_fields: ['id']
                    },
                    path: ['posts', 0]
                }
            ]

            // categories and posts are not connected, so there is no edge paths
            const wheres = get_identifier_connected_wheres(
                global_test_schema,
                default_connection_edges,
                new Map(),
                {
                    $entity: 'categories',
                    $field: 'id',
                    $values: [1]
                },
                mutation_pieces,
                [0],
                'posts'
            )

            expect(wheres).to.deep.equal([])
        })
    })
    describe(get_foreign_key_connected_wheres.name, () => {
        test('tracks direct child foreign keys', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'delete',
                        id: 1,
                        user_id: 12,
                        title: 'hi',
                        $identifying_fields: ['id']
                    },
                    path: ['posts', 0]
                },
                {
                    record: {
                        $operation: 'create',
                        user_id: 13,
                        title: 'hi'
                    },
                    path: ['posts', 1]
                }
            ]

            const wheres = get_foreign_key_connected_wheres(
                default_connection_edges,
                get_test_where_connected('users'),
                mutation_pieces,
                [0, 1],
                'posts'
            )

            expect(wheres).to.deep.equal([
                {
                    $in: ['id', [12, 13]]
                }
            ])
        })
        test('tracks descendant foreign keys', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        post_id: 11,
                        $identifying_fields: ['id']
                    },
                    path: ['comments', 0]
                },
                {
                    record: {
                        $operation: 'create',
                        post_id: 12
                    },
                    path: ['comments', 1]
                }
            ]

            const wheres = get_foreign_key_connected_wheres(
                default_connection_edges,
                get_test_where_connected('users'),
                mutation_pieces,
                [0, 1],
                'comments'
            )

            expect(wheres).to.deep.equal([
                {
                    $in: [
                        'id',
                        {
                            $select: ['user_id'],
                            $from: 'posts',
                            $where: {
                                $in: ['id', [11, 12]]
                            }
                        }
                    ]
                }
            ])
        })
        test('handles no foreign key', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        $identifying_fields: ['id']
                    },
                    path: ['comments', 0]
                }
            ]

            const wheres = get_foreign_key_connected_wheres(
                default_connection_edges,
                get_test_where_connected('users'),
                mutation_pieces,
                [0],
                'comments'
            )

            expect(wheres).to.deep.equal([])
        })
        test('handles null foreign key', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        billing_address_id: null,
                        $identifying_fields: ['id']
                    },
                    path: ['users', 0]
                }
            ]

            const wheres = get_foreign_key_connected_wheres(
                default_connection_edges,
                get_test_where_connected('addresses'),
                mutation_pieces,
                [0],
                'users'
            )

            expect(wheres).to.deep.equal([])
        })
    })
})

/*

{
    variants: [{
        $operation: 'update',
        id: 11,
        product_id: { $guid: 1},
        products: [{
            // allowed through, since you can edit the variant and we cant search on the product. But you shouldnt 
            // be allowed to edit the product. So this is a bug
            $operation: 'update' 
            id: { $guid: 1}
        }]
    }]
}


product_id is 1, which is not your product

product_id is not an edge, but products.user_id is

TODO: disallow updates / deletes without an identiftying key, even if there are guids that can be used,
to prevent the above bug.
For creates its fine to have guid identifying keys since this bug shouldnt be possible for only creates.


If create, a guid is either on the primary key and some other row will now update to it (fine, since the created
row belongs to us after we check its foreign keys) or the guid is on a foreign key of the create and points to
the primary key of some other row (fine, since that other row must belong to us since it passes ownership check).

So we can ignore guids on creates
*/
