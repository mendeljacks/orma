import { describe, test } from 'mocha'
import { apply_select_macro } from './select_macro'
import { expect } from 'chai'
import { OrmaSchema } from '../../types/schema/schema_types'

describe('select_macro', () => {
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
            images: {
                $fields: { id: {}, url: {}, product_id: {} },
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
        test('adds foreign keys for renamed subquery', () => {
            const query = {
                products: {
                    my_images: {
                        $from: 'images',
                    },
                },
            }

            apply_select_macro(query, orma_schema)
            const goal = {
                products: {
                    $select: ['id'],
                    $from: 'products',
                    my_images: {
                        $select: ['product_id'],
                        $from: 'images',
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
        test('combines with existing $select', () => {
            const query = {
                products: {
                    id: true,
                    $select: ['title'],
                },
            }

            apply_select_macro(query, orma_schema)
            const goal = {
                products: {
                    $from: 'products',
                    $select: ['title', 'id'],
                },
            }

            expect(query).to.deep.equal(goal)
        })
    })
})
