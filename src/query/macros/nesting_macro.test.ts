import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import { expect } from 'chai'
import { apply_nesting_macro } from './nesting_macro'

describe('query_macros', () => {
    const orma_schema: OrmaSchema = {
        products: {
            $database_type: 'mysql',
            id: {},
            vendor_id: {
                references: {
                    vendors: {
                        id: {},
                    },
                },
            },
        },
        vendors: {
            $database_type: 'mysql',
            id: {},
        },
        payments: {
            $database_type: 'mysql',
            id: {},
            from_vendor_id: {
                references: {
                    vendors: {
                        id: {},
                    },
                },
            },
            to_vendor_id: {
                references: {
                    vendors: {
                        id: {},
                    },
                },
            },
        },
        receipts: {
            $database_type: 'mysql',
            id: {},
            payment_id: {
                references: {
                    payments: {
                        id: {},
                    },
                },
            },
        },
        images: {
            $database_type: 'mysql',
            id: {},
            product_id: {
                references: {
                    products: {
                        id: {},
                    },
                },
            },
        },
        image_urls: {
            $database_type: 'mysql',
            image_id: {
                references: {
                    images: {
                        id: {},
                    },
                },
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
