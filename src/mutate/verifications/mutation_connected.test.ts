import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import {
    add_connection_edges,
    ConnectionEdges,
    get_upwards_connection_edges,
} from '../../query/macros/where_connected_macro'
import { WhereConnected } from '../../types/query/query_types'
import { MysqlFunction } from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'
import {
    get_foreign_key_wheres,
    get_ownership_queries,
    get_primary_key_wheres,
    get_mutation_connected_errors,
} from './mutation_connected'

describe('mutation_connected.ts', () => {
    const schema: OrmaSchema = {
        vendors: {
            $database_type: 'mysql',
            id: {
                primary_key: true,
                not_null: true,
            },
        },
        listings: {
            $database_type: 'mysql',
            id: {
                primary_key: true,
                not_null: true,
            },
        },
        products: {
            $database_type: 'mysql',
            id: {
                primary_key: true,
                not_null: true,
            },
            vendor_id: {
                not_null: true,
                references: {
                    vendors: {
                        id: {},
                    },
                },
            },
            listing_id: {
                not_null: true,
                references: {
                    listings: {
                        id: {},
                    },
                },
            },
            title: {
                not_null: true,
            },
            $indexes: [
                {
                    fields: ['title'],
                    is_unique: true,
                },
            ],
        },
        categories: {
            $database_type: 'mysql',
            id: {
                not_null: true,
                primary_key: true,
            },
        },
        warehouses: {
            $database_type: 'mysql',
            id: {
                primary_key: true,
                not_null: true,
            },
            vendor_id: {
                not_null: true,
                references: {
                    vendors: {
                        id: {},
                    },
                },
            },
            name: {
                not_null: true,
            },
            $indexes: [
                {
                    fields: ['name'],
                    is_unique: true,
                },
            ],
        },
        accounts: {
            $database_type: 'mysql',
            id: {
                primary_key: true,
                not_null: true,
            },
            vendor_id1: {
                references: {
                    vendors: {
                        id: {},
                    },
                },
            },
            vendor_id2: {
                references: {
                    vendors: {
                        id: {},
                    },
                },
            },
        },
        variants: {
            $database_type: 'mysql',
            id: {
                primary_key: true,
                not_null: true,
            },
            product_id: {
                not_null: true,
                references: {
                    products: {
                        id: {},
                    },
                },
            },
            sku: { not_null: true },
            $indexes: [
                {
                    fields: ['sku'],
                    is_unique: true,
                },
            ],
        },
    }

    const default_connection_edges = get_upwards_connection_edges(schema)
    const vendor_where_connected: WhereConnected<OrmaSchema>[number] = {
        $entity: 'vendors',
        $field: 'id',
        $values: [1, 2],
    }

    describe(get_mutation_connected_errors.name, () => {
        test('integration test', async () => {
            const query_function: MysqlFunction = async statements => [
                [
                    {
                        id: 2,
                    },
                    {
                        id: 5,
                    },
                ],
            ]

            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        vendor_id: 2,
                    },
                    path: ['products', 0],
                },
                {
                    record: {
                        $operation: 'create',
                        vendor_id: 5,
                    },
                    path: ['products', 1],
                },
            ]

            const errors = await get_mutation_connected_errors(
                schema,
                default_connection_edges,
                query_function,
                [vendor_where_connected],
                mutation_pieces
            )
            expect(errors.length).to.equal(1)
        })
        test('works when nothing is connected to ownership entity', async () => {
            const query_function: MysqlFunction = async statements => []

            const mutation_pieces = []

            const errors = await get_mutation_connected_errors(
                schema,
                default_connection_edges,
                query_function,
                [vendor_where_connected],
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
                        vendor_id: 12,
                        title: 'hi',
                    },
                    path: ['products', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                    },
                    path: ['warehouses', 0],
                },
            ]

            const ownership_queries = get_ownership_queries(
                schema,
                default_connection_edges,
                [vendor_where_connected],
                mutation_pieces
            )

            expect(ownership_queries).to.deep.equal([
                {
                    $select: ['id'],
                    $from: 'vendors',
                    $where: {
                        $or: [
                            { $in: ['id', [12]] },
                            {
                                $in: [
                                    'id',
                                    {
                                        $select: ['vendor_id'],
                                        $from: 'warehouses',
                                        $where: { $eq: ['id', 1] },
                                    },
                                ],
                            },
                        ],
                    },
                },
            ])
        })
        test('handles reverse nesting ownership', () => {
            const mutation_pieces: MutationPiece[] = [
                // updating generates a where clause
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                    },
                    path: ['listings', 0],
                },
                // creating does not generate a where clause here, even though there is a connection edge to products,
                // since in the create we dont include a foreign key to anything existing in the database
                {
                    record: {
                        $operation: 'create',
                    },
                    path: ['listings', 0],
                },
            ]

            // in this examle, we set up the connection edges so that a listing is considered connected
            // to a vendor if one of the products connected to that listing are connected to the vendor
            const connection_edges = add_connection_edges(
                default_connection_edges,
                [
                    {
                        from_entity: 'listings',
                        from_field: 'id',
                        to_entity: 'products',
                        to_field: 'listing_id',
                    },
                ]
            )

            const ownership_queries = get_ownership_queries(
                schema,
                connection_edges,
                [vendor_where_connected],
                mutation_pieces
            )

            expect(ownership_queries).to.deep.equal([
                {
                    $select: ['id'],
                    $from: 'vendors',
                    $where: {
                        // there are two almost identical clauses because the foreign key column (id in this case since
                        // it is a reverse nest) is also the identifying key. We could dedupe this in future, but I'm
                        // leaving it for now
                        $or: [
                            {
                                $in: [
                                    'id',
                                    {
                                        $select: ['vendor_id'],
                                        $from: 'products',
                                        $where: { $in: ['listing_id', [1]] },
                                    },
                                ],
                            },
                            {
                                $in: [
                                    'id',
                                    {
                                        $select: ['vendor_id'],
                                        $from: 'products',
                                        $where: {
                                            $in: [
                                                'listing_id',
                                                {
                                                    $select: ['id'],
                                                    $from: 'listings',
                                                    $where: { $eq: ['id', 1] },
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                },
            ])
        })
        test('handles creating a child of a reverse connected entity', () => {
            const mutation_pieces: MutationPiece[] = [
                // in this case we expect that any vendors connected to an already existing product connected to
                // listing 1 will show up in the connected query
                {
                    record: {
                        $operation: 'create',
                        listing_id: 1,
                    },
                    path: ['products', 0],
                },
            ]

            // in this examle, we set up the connection edges so that a listing is considered connected
            // to a vendor if one of the products connected to that listing are connected to the vendor
            const connection_edges = add_connection_edges(
                default_connection_edges,
                [
                    {
                        from_entity: 'listings',
                        from_field: 'id',
                        to_entity: 'products',
                        to_field: 'listing_id',
                    },
                ]
            )

            const ownership_queries = get_ownership_queries(
                schema,
                connection_edges,
                [vendor_where_connected],
                mutation_pieces
            )

            expect(ownership_queries).to.deep.equal([
                {
                    $select: ['id'],
                    $from: 'vendors',
                    $where: {
                        $in: [
                            'id',
                            {
                                $select: ['vendor_id'],
                                $from: 'products',
                                $where: {
                                    $in: [
                                        'listing_id',
                                        {
                                            $select: ['id'],
                                            $from: 'listings',
                                            $where: {
                                                $in: ['id', [1]],
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            ])
        })
        test('handles entity with no connected to table', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                    },
                    path: ['categories', 0],
                },
            ]

            const connection_edges: ConnectionEdges = {}

            const ownership_queries = get_ownership_queries(
                schema,
                connection_edges,
                [vendor_where_connected],
                mutation_pieces
            )

            expect(ownership_queries).to.deep.equal([])
        })
        test('ignores $guids', () => {
            const mutation_pieces: MutationPiece[] = [
                // in this case we expect that any vendors connected to an already existing product connected to
                // listing 1 will show up in the connected query
                {
                    record: {
                        $operation: 'create',
                        vendor_id: { $guid: 2 },
                    },
                    path: ['products', 0],
                },
            ]

            const ownership_queries = get_ownership_queries(
                schema,
                default_connection_edges,
                [vendor_where_connected],
                mutation_pieces
            )

            expect(ownership_queries).to.deep.equal([])
        })
    })
    describe(get_primary_key_wheres.name, () => {
        test('tracks primary keys', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 12,
                        title: 'hi',
                    },
                    path: ['products', 0],
                },
            ]

            const wheres = get_primary_key_wheres(
                schema,
                default_connection_edges,
                vendor_where_connected,
                mutation_pieces,
                'products'
            )

            expect(wheres).to.deep.equal([
                {
                    $in: [
                        'id',
                        {
                            $select: ['vendor_id'],
                            $from: 'products',
                            $where: { $eq: ['id', 12] },
                        },
                    ],
                },
            ])
        })
        test('handles multiple ownership paths', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                    },
                    path: ['accounts', 0],
                },
            ]

            const wheres = get_primary_key_wheres(
                schema,
                default_connection_edges,
                vendor_where_connected,
                mutation_pieces,
                'accounts'
            )

            expect(wheres).to.deep.equal([
                {
                    $in: [
                        'id',
                        {
                            $select: ['vendor_id1'],
                            $from: 'accounts',
                            $where: { $eq: ['id', 1] },
                        },
                    ],
                },
                {
                    $in: [
                        'id',
                        {
                            $select: ['vendor_id2'],
                            $from: 'accounts',
                            $where: { $eq: ['id', 1] },
                        },
                    ],
                },
            ])
        })
        test('handles no primary key', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        vendor_id: 12,
                    },
                    path: ['products', 0],
                },
            ]

            const wheres = get_primary_key_wheres(
                schema,
                default_connection_edges,
                vendor_where_connected,
                mutation_pieces,
                'products'
            )

            expect(wheres).to.deep.equal([])
        })
    })
    describe(get_foreign_key_wheres.name, () => {
        test('tracks direct child foreign keys', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'delete',
                        id: 1,
                        vendor_id: 12,
                        title: 'hi',
                    },
                    path: ['products', 0],
                },
                {
                    record: {
                        $operation: 'create',
                        vendor_id: 13,
                        title: 'hi',
                    },
                    path: ['products', 1],
                },
            ]

            const wheres = get_foreign_key_wheres(
                default_connection_edges,
                vendor_where_connected,
                mutation_pieces,
                'products'
            )

            expect(wheres).to.deep.equal([
                {
                    $in: ['id', [12, 13]],
                },
            ])
        })
        test('tracks descendant foreign keys', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        product_id: 11,
                        sku: 'test1',
                    },
                    path: ['variants', 0],
                },
                {
                    record: {
                        $operation: 'create',
                        product_id: 12,
                        sku: 'test2',
                    },
                    path: ['variants', 1],
                },
            ]

            const wheres = get_foreign_key_wheres(
                default_connection_edges,
                vendor_where_connected,
                mutation_pieces,
                'variants'
            )

            expect(wheres).to.deep.equal([
                {
                    $in: [
                        'id',
                        {
                            $select: ['vendor_id'],
                            $from: 'products',
                            $where: {
                                $in: ['id', [11, 12]],
                            },
                        },
                    ],
                },
            ])
        })
        test('handles no foreign key', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                    },
                    path: ['variants', 0],
                },
            ]

            const wheres = get_foreign_key_wheres(
                default_connection_edges,
                vendor_where_connected,
                mutation_pieces,
                'variants'
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

product_id is not an edge, but products.vendor_id is

TODO: disallow updates / deletes without an identiftying key, even if there are guids that can be used,
to prevent the above bug.
For creates its fine to have guid identifying keys since this bug shouldnt be possible for only creates.


If create, a guid is either on the primary key and some other row will now update to it (fine, since the created
row belongs to us after we check its foreign keys) or the guid is on a foreign key of the create and points to
the primary key of some other row (fine, since that other row must belong to us since it passes ownership check).

So we can ignore guids on creates
*/
