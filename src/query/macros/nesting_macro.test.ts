import { describe, test } from 'mocha'
import { OrmaSchema } from '../../types/schema/schema_types'
import { expect } from 'chai'
import { apply_nesting_macro } from './nesting_macro'

describe('query_macros', () => {
    const orma_schema: OrmaSchema = {
        $entities: {
            products: {
                $fields: { id: {}, vendor_id: {} },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'vendor_id',
                        to_entity: 'vendors',
                        to_field: 'id',
                    },
                ],
            },
            vendors: { $fields: { id: {} }, $database_type: 'mysql' },
            payments: {
                $fields: { id: {}, from_vendor_id: {}, to_vendor_id: {} },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'from_vendor_id',
                        to_entity: 'vendors',
                        to_field: 'id',
                    },
                    {
                        from_field: 'to_vendor_id',
                        to_entity: 'vendors',
                        to_field: 'id',
                    },
                ],
            },
            receipts: {
                $fields: { id: {}, payment_id: {} },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'payment_id',
                        to_entity: 'payments',
                        to_field: 'id',
                    },
                ],
            },
            images: {
                $fields: { id: {}, product_id: {} },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'product_id',
                        to_entity: 'products',
                        to_field: 'id',
                    },
                ],
            },
            image_urls: {
                $fields: { image_id: {} },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'image_id',
                        to_entity: 'images',
                        to_field: 'id',
                    },
                ],
            },
        },
        $cache: {
            $reversed_foreign_keys: {
                vendors: [
                    {
                        from_field: 'id',
                        to_entity: 'products',
                        to_field: 'vendor_id',
                    },
                    {
                        from_field: 'id',
                        to_entity: 'payments',
                        to_field: 'from_vendor_id',
                    },
                    {
                        from_field: 'id',
                        to_entity: 'payments',
                        to_field: 'to_vendor_id',
                    },
                ],
                payments: [
                    {
                        from_field: 'id',
                        to_entity: 'receipts',
                        to_field: 'payment_id',
                    },
                ],
                products: [
                    {
                        from_field: 'id',
                        to_entity: 'images',
                        to_field: 'product_id',
                    },
                ],
                images: [
                    {
                        from_field: 'id',
                        to_entity: 'image_urls',
                        to_field: 'image_id',
                    },
                ],
            },
        },
    }

    describe(apply_nesting_macro.name, () => {
        test('handles root nesting', () => {
            const query = {
                products: {
                    id: true,
                    images: {
                        id: true,
                        product_id: true,
                    },
                },
            }

            const previous_results = [[['products'], [{ id: 1 }, { id: 2 }]]]

            apply_nesting_macro(
                query,
                ['products', 'images'],
                previous_results,
                orma_schema
            )

            const goal = {
                products: {
                    id: true,
                    images: {
                        id: true,
                        product_id: true,
                        $where: {
                            $in: ['product_id', [1, 2]],
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('handles deep nesting', () => {
            const query = {
                products: {
                    images: {
                        image_urls: {
                            id: true,
                        },
                    },
                },
            }

            const previous_results = [[['products'], [{ id: 1 }, { id: 2 }]]]
            apply_nesting_macro(
                query,
                ['products', 'images', 'image_urls'],
                previous_results,
                orma_schema
            )

            const goal = {
                products: {
                    images: {
                        image_urls: {
                            id: true,
                            $where: {
                                $in: [
                                    'image_id',
                                    {
                                        $select: ['id'],
                                        $from: 'images',
                                        $where: {
                                            $in: ['product_id', [1, 2]],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('handles nesting under where clause', () => {
            const query = {
                products: {
                    images: {
                        // the where clause is on images, so image_urls will nest based on images
                        $where: { $gt: ['id', 0] },
                        image_urls: {},
                    },
                },
            }

            const previous_results = [
                [['products'], [{ id: 1 }, { id: 2 }]],
                [['products', 'images'], [{ id: 3 }]],
            ]

            apply_nesting_macro(
                query,
                ['products', 'images', 'image_urls'],
                previous_results,
                orma_schema
            )

            const goal = {
                products: {
                    images: {
                        $where: { $gt: ['id', 0] },
                        image_urls: {
                            $where: {
                                $in: ['image_id', [3]],
                            },
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('nests based on from clause', () => {
            const query = {
                my_products: {
                    $from: 'products',
                    my_images: {
                        $from: 'images',
                        $where: { $gt: ['id', 0] },
                        image_urls: {},
                    },
                },
            }

            const previous_results = [
                [['my_products'], [{ id: 1 }]],
                [['my_products', 'my_images'], [{ id: 3 }]],
            ]

            apply_nesting_macro(
                query,
                ['my_products', 'my_images'],
                previous_results,
                orma_schema
            )

            apply_nesting_macro(
                query,
                ['my_products', 'my_images', 'image_urls'],
                previous_results,
                orma_schema
            )

            const goal = {
                my_products: {
                    $from: 'products',
                    my_images: {
                        $from: 'images',
                        $where: {
                            $and: [
                                {
                                    $gt: ['id', 0],
                                },
                                {
                                    $in: ['product_id', [1]],
                                },
                            ],
                        },
                        image_urls: {
                            $where: {
                                $in: ['image_id', [3]],
                            },
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('ignores undefined where/having clauses', () => {
            const query = {
                products: {
                    images: {
                        $where: undefined,
                        $having: undefined,
                        image_urls: {},
                    },
                },
            }

            const previous_results = [
                [['products'], [{ id: 1 }, { id: 2 }]],
                [['products', 'images'], [{ id: 3 }]],
            ]
            apply_nesting_macro(
                query,
                ['products', 'images', 'image_urls'],
                previous_results,
                orma_schema
            )

            const goal = {
                products: {
                    images: {
                        $where: undefined,
                        $having: undefined,
                        image_urls: {
                            $where: {
                                $in: [
                                    'image_id',
                                    {
                                        $select: ['id'],
                                        $from: 'images',
                                        $where: {
                                            $in: ['product_id', [1, 2]],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('respects $foreign_key', () => {
            const query = {
                vendors: {
                    payments: {
                        $foreign_key: ['from_vendor_id'],
                        receipts: {
                            id: true,
                        },
                    },
                },
            }

            const previous_results = [[['vendors'], [{ id: 1 }, { id: 2 }]]]
            apply_nesting_macro(
                query,
                ['vendors', 'payments', 'receipts'],
                previous_results,
                orma_schema
            )

            const goal = {
                vendors: {
                    payments: {
                        $foreign_key: ['from_vendor_id'],
                        receipts: {
                            id: true,
                            $where: {
                                $in: [
                                    'payment_id',
                                    {
                                        $select: ['id'],
                                        $from: 'payments',
                                        $where: {
                                            $in: ['from_vendor_id', [1, 2]],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
    })
})
