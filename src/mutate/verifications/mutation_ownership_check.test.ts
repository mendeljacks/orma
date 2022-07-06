import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import { get_upwards_connection_edges } from '../../query/macros/where_connected_macro'
import { WhereConnected } from '../../types/query/query_types'
import { MutationPiece } from '../plan/mutation_plan'
import {
    get_foreign_key_wheres,
    get_ownership_query,
    get_primary_key_wheres,
    mutation_ownership_check,
} from './mutation_ownership_check'

describe('mutation_ownership_check', () => {
    const schema: OrmaSchema = {
        vendors: {
            id: {
                primary_key: true,
                not_null: true,
            },
        },
        products: {
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
        variants: {
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
    const vendor_where_connected: WhereConnected<OrmaSchema> = [
        {
            $entity: 'vendors',
            $field: 'id',
            $values: [1, 2],
        },
    ]

    describe.skip(mutation_ownership_check.name, () => {
        test('integration test', async () => {
            const query_function = async () => ({
                vendors: [
                    {
                        id: 2,
                    },
                    {
                        id: 5,
                    },
                ],
            })

            const mutation = {
                products: [
                    {
                        meta: { operation: 'create' },
                        vendor_id: 1,
                    },
                ],
            }

            const error = await mutation_ownership_check(
                mutation,
                'vendors',
                'id',
                [1, 2, 3],
                {},
                query_function,
                {}
            )
            expect(error).to.not.equal(undefined)
        })
        test('works when nothing is connected to ownership entity', async () => {
            const query_function = async () => {}

            const mutation = {}

            const error = await mutation_ownership_check(
                mutation,
                'vendors',
                'id',
                [1, 2, 3],
                {},
                query_function,
                {}
            )
            expect(error).to.equal(undefined)
        })
        test('works when no ownership entity is returned from query', async () => {
            const query_function = async () => {}

            const mutation = {
                products: [
                    {
                        meta: { operation: 'create' },
                        vendor_id: 1,
                    },
                ],
            }

            const error = await mutation_ownership_check(
                mutation,
                'vendors',
                'id',
                [1, 2, 3],
                {},
                query_function,
                {}
            )
            expect(error).to.equal(undefined)
        })
    })
    describe(get_primary_key_wheres.name, () => {
        test.only('tracks primary keys', () => {
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
                    $eq: ['id', 12],
                },
            ])
        })
    })
    describe(get_ownership_query.name, () => {
        test('tracks direct child foreign keys', () => {
            const mutation = {
                products: [
                    {
                        meta: { operation: 'delete' },
                        id: 1,
                        vendor_id: 12,
                        title: 'hi',
                    },
                    {
                        meta: { operation: 'create' },
                        vendor_id: 13,
                        title: 'hi',
                    },
                ],
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', {})

            expect(ownership_query).to.deep.equal({
                vendors: {
                    where: {
                        or: [
                            {
                                in: ['id', [12, 13]],
                            },
                            {
                                any: [
                                    'products',
                                    {
                                        in: ['id', [1]],
                                    },
                                ],
                            },
                        ],
                    },
                },
            })
        })
        test('tracks multiple entities', () => {
            const mutation = {
                products: [
                    {
                        meta: { operation: 'create' },
                        vendor_id: 12,
                        title: 'hi',
                    },
                ],
                warehouses: [
                    {
                        meta: { operation: 'update' },
                        id: 1,
                    },
                ],
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', {})

            expect(ownership_query).to.deep.equal({
                vendors: {
                    where: {
                        or: [
                            {
                                in: ['id', [12]],
                            },
                            {
                                any: [
                                    'warehouses',
                                    {
                                        in: ['id', [1]],
                                    },
                                ],
                            },
                        ],
                    },
                },
            })
        })
        test('tracks ownership entity updates', () => {
            const mutation = {
                vendors: [
                    {
                        meta: { operation: 'update' },
                        id: 1,
                        name: 'hi',
                    },
                ],
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', {})

            expect(ownership_query).to.deep.equal({
                vendors: {
                    where: {
                        in: ['id', [1]],
                    },
                },
            })
        })
        test('ignores ownership entity creates', () => {
            const mutation = {
                vendors: [
                    {
                        meta: { operation: 'create' },
                        id: 12,
                        name: 'hi',
                    },
                ],
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', {})
            expect(ownership_query).to.equal(undefined)
        })
        test('throws on no operation provided', () => {
            const mutation = {
                products: [
                    {
                        vendor_id: 12,
                        title: 'hi',
                    },
                ],
            }

            try {
                const ownership_query = get_ownership_query(
                    mutation,
                    'vendors',
                    {}
                )
                expect('should throw an error').to.equal(true)
            } catch (error) {}
        })
        test('ignores diffed fields', () => {
            const mutation = {
                products: [
                    {
                        meta: { operation: 'create' },
                        vendor_id: 12,
                        title: 'hi',
                    },
                    {
                        meta: { operation: 'update' },
                        id: 2,
                        title: 'hi',
                    },
                ],
                inventory_adjustments: [
                    {
                        meta: { operation: 'create' },
                        variant_id: 1,
                        shelf_id: 2,
                    },
                ],
            }

            const ownership_ignores = {
                products: ['vendor_id'],
                inventory_adjustments: ['shelf_id'],
            }

            const ownership_query = get_ownership_query(
                mutation,
                'vendors',
                ownership_ignores
            )

            expect(ownership_query).to.deep.equal({
                vendors: {
                    where: {
                        any: [
                            'products.variants',
                            {
                                in: ['id', [1]],
                            },
                        ],
                    },
                },
            })
        })
        test.skip(
            'add tests for $guid in the identifying key and in the foreign key'
        )
        test.skip('backwards connection edges / ignores')
    })
    describe(get_foreign_key_wheres.name, () => {
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
                vendor_where_connected[0],
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
                                in: ['id', [11, 12]],
                            },
                        },
                    ],
                },
            ])
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
