import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import { apply_any_path_macro } from './any_path_macro'
import { expect } from 'chai'

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
        test('respects $from', () => {
            const query = {
                my_products: {
                    $from: 'products',
                    $where: {
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
                my_products: {
                    $from: 'products',
                    $where: {
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
                },
            }
            expect(query).to.deep.equal(goal)
        })
    })
})
