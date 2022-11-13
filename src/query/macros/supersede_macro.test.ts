import { describe, test } from 'mocha'
import { apply_supersede_macro } from './supersede_macro'
import { expect } from 'chai'
import { OrmaSchema } from '../../introspector/introspector'
import { clone } from '../../helpers/helpers'

const orma_schema: OrmaSchema = {
    users: {
        $database_type: 'mysql',
        id: { primary_key: true },
    },
    user_has_photos: {
        $database_type: 'mysql',
        id: { primary_key: true },
        url: {},
        user_id: {
            references: {
                users: {
                    id: {},
                },
            },
        },
        $indexes: [
            {
                index_name: 'primary',
                fields: ['id'],
                is_unique: true,
            },
            {
                index_name: 'uniq',
                fields: ['url'],
                is_unique: true,
            },
        ],
    },
    user_has_posts: {
        $database_type: 'mysql',
        id: { primary_key: true },
        text: {},
        user_id: {
            references: {
                users: {
                    id: {},
                },
            },
        },
    },
}

describe.only('supersede_macro', () => {
    test('handles supersedes', async () => {
        const mutation = {
            $operation: 'update',
            users: [
                {
                    id: 1,
                    $supersede: ['user_has_photos', 'user_has_posts'],
                    user_has_photos: [
                        { url: 'https://pic.jpg' },
                        { url: 'https://pic2.jpg' },
                    ],
                    user_has_posts: [{ text: 'hi' }, { text: 'there' }],
                },
            ],
        }

        const goal = {
            $operation: 'update',
            users: [
                {
                    id: 1,
                    user_has_photos: [
                        { $operation: 'delete', category_id: 1 },
                        { $operation: 'update', category_id: 2 },
                        { $operation: 'create', category_id: 3 },
                    ],
                    user_has_posts: [
                        { $operation: 'delete', attribute_id: 1 },
                        { $operation: 'update', attribute_id: 2 },
                        { $operation: 'create', attribute_id: 3 },
                    ],
                },
            ],
        }

        const orma_query = async query => {
            debugger
        }

        await apply_supersede_macro(mutation, orma_query, orma_schema).catch(
            err => {
                debugger
            }
        )

        expect(mutation).to.deep.equal(goal)
    })
    // reverse nesting
    // unique column finding
    // multiple and single supersede
    // only deletes connected
    // updates when exists

    test('handles reverse nesting foreign keys', () => {
        const query = {
            products: {
                images: { url: true },
                vendors: {},
            },
        }

        apply_supersede_macro(query, orma_schema)

        const goal = {
            products: {
                $supersede: ['id', 'vendor_id'],
                $from: 'products',
                images: {
                    $supersede: ['url', 'product_id'],
                    $from: 'images',
                },
                vendors: {
                    $supersede: ['id'],
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

        apply_supersede_macro(query, orma_schema)
        const goal = {
            products: {
                $supersede: ['id'],
                $from: 'products',
                my_images: {
                    $supersede: ['product_id'],
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

        apply_supersede_macro(query, orma_schema)
        const goal = {
            my_products: {
                $supersede: ['id'],
                $from: 'products',
            },
        }

        expect(query).to.deep.equal(goal)
    })
    test('combines with existing $supersede', () => {
        const query = {
            products: {
                id: true,
                $supersede: ['title'],
            },
        }

        apply_supersede_macro(query, orma_schema)
        const goal = {
            products: {
                $from: 'products',
                $supersede: ['title', 'id'],
            },
        }

        expect(query).to.deep.equal(goal)
    })
})
