import { describe, test } from 'mocha'
import { apply_any_path_macro, apply_nesting_macro, apply_select_macro } from './query_macros'
import { expect } from 'chai'
import { orma_schema } from '../introspector/introspector'

describe('query_macros', () => {
    const orma_schema: orma_schema = {
        products: {
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
            id: {},
        },
        images: {
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
            image_id: {
                references: {
                    images: {
                        id: {},
                    },
                },
            },
        },
    }
    describe(apply_any_path_macro.name, () => {
        test('multiple any clauses', () => {
            const query = {
                products: {
                    $where: {
                        $and: [
                            {
                                $any_path: [
                                    ['images'],
                                    {
                                        $eq: ['id', 1],
                                    },
                                ],
                            },
                            {
                                $any_path: [
                                    ['vendors'],
                                    {
                                        $eq: ['id', 1],
                                    },
                                ],
                            },
                        ],
                    },
                },
            }

            apply_any_path_macro(query, orma_schema)

            const goal = {
                products: {
                    $where: {
                        $and: [
                            {
                                $in: [
                                    'id',
                                    {
                                        $select: ['product_id'],
                                        $from: 'images',
                                        $where: {
                                            $eq: ['id', 1],
                                        },
                                    },
                                ],
                            },
                            {
                                $in: [
                                    'vendor_id',
                                    {
                                        $select: ['id'],
                                        $from: 'vendors',
                                        $where: {
                                            $eq: ['id', 1],
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('deep any path', () => {
            const query = {
                products: {
                    $where: {
                        $any_path: [
                            ['images', 'image_urls'],
                            {
                                $eq: ['id', 1],
                            },
                        ],
                    },
                },
            }

            apply_any_path_macro(query, orma_schema)

            const goal = {
                products: {
                    $where: {
                        $in: [
                            'id',
                            {
                                $select: ['product_id'],
                                $from: 'images',
                                $where: {
                                    $in: [
                                        'id',
                                        {
                                            $select: ['image_id'],
                                            $from: 'image_urls',
                                            $where: {
                                                $eq: ['id', 1],
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('nested anys', () => {
            const query = {
                products: {
                    $where: {
                        $any_path: [
                            ['images'],
                            {
                                $any_path: [
                                    ['image_urls'],
                                    {
                                        $eq: ['id', 1],
                                    },
                                ],
                            },
                        ],
                    },
                },
            }

            apply_any_path_macro(query, orma_schema)

            const goal = {
                products: {
                    $where: {
                        $in: [
                            'id',
                            {
                                $select: ['product_id'],
                                $from: 'images',
                                $where: {
                                    $in: [
                                        'id',
                                        {
                                            $select: ['image_id'],
                                            $from: 'image_urls',
                                            $where: {
                                                $eq: ['id', 1],
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('uses having', () => {
            const query = {
                products: {
                    $having: {
                        $any_path: [
                            ['images'],
                            {
                                $eq: ['id', 1],
                            },
                        ],
                    },
                },
            }

            apply_any_path_macro(query, orma_schema)
            const goal = {
                products: {
                    $having: {
                        $in: [
                            'id',
                            {
                                $select: ['product_id'],
                                $from: 'images',
                                $having: {
                                    $eq: ['id', 1],
                                },
                            },
                        ],
                    },
                },
            }
            expect(query).to.deep.equal(goal)
        })
    })
    describe(apply_select_macro.name, () => {
        test('handles selects/handles root', () => {
            const query = {
                products: {
                    id: true,
                    my_title: 'title',
                    total_quantity: {
                        $sum: 'quantity',
                    },
                },
            }

            apply_select_macro(query, orma_schema)

            const goal = {
                products: {
                    $select: [
                        'id',
                        { $as: ['title', 'my_title'] },
                        { $as: [{ $sum: 'quantity' }, 'total_quantity'] },
                    ],
                    $from: 'products',
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test('handles adding foreign keys', () => {
            const query = {
                products: {
                    images: { url: true },
                    vendors: {},
                },
            }

            apply_select_macro(query, orma_schema)

            const goal = {
                products: {
                    $select: ['id', 'vendor_id'],
                    $from: 'products',
                    images: {
                        $select: ['url', 'product_id'],
                        $from: 'images',
                    },
                    vendors: {
                        $select: ['id'],
                        $from: 'vendors'
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test("respects 'from' clause", () => {
            const query = {
                my_products: {
                    id: true,
                    $from: 'products',
                },
            }

            apply_select_macro(query, orma_schema)
            const goal = {
                my_products: {
                    $select: ['id'],
                    $from: 'products',
                },
            }

            expect(query).to.deep.equal(goal)
        })
    })
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

            apply_nesting_macro(query, ['products', 'images'], previous_results, orma_schema)

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
                                            $in: ['product_id', [1, 2]]
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
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

            apply_nesting_macro(query, ['my_products', 'my_images'], previous_results, orma_schema)

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
                                }
                            ]
                        },
                        image_urls: {
                            $where: {
                                $in: ['image_id', [3]]
                            }
                        }
                    }
                }
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
    })
})
