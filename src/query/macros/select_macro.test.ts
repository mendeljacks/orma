import { describe, test } from 'mocha'
import { apply_select_macro } from './select_macro'
import { expect } from 'chai'
import { OrmaSchema } from '../../introspector/introspector'

describe('select_macro', () => {
    const orma_schema: OrmaSchema = {
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
                        $from: 'vendors',
                    },
                },
            }

            expect(query).to.deep.equal(goal)
        })
        test("adds foreign keys for renamed subquery", () => {
            const query = {
                products: {
                    my_images: {
                        $from: 'images'
                    }
                }
            }

            apply_select_macro(query, orma_schema)
            const goal = {
                products: {
                    $select: ['id'],
                    $from: 'products',
                    my_images: {
                        $select: ['product_id'],
                        $from: 'images'
                    }
                }
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
})
