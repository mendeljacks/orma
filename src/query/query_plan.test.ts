import { expect } from 'chai'
import { describe, test } from 'mocha'
import { get_query_plan } from './query_plan'


describe('query_plan', () => {
    describe(get_query_plan.name, () => {
        test('splits by $where clause and $having', () => {
            const query = {
                vendors: {
                    products: {
                        $where: { $eq: ['id', 0] },
                        vins: {
                            id: true
                        },
                        images: {
                            image_urls: {
                                $having: { $eq: ['id', 0] },
                                id: true
                            }
                        }
                    }
                }
            }

            const result = get_query_plan(query)

            // the split happens at variants because it has a where clause
            const goal = [
                [['vendors']], // root levels always go in their own tier
                [['vendors', 'products']],
                [
                    ['vendors', 'products', 'vins'],
                    ['vendors', 'products', 'images'],
                    ['vendors', 'products', 'images', 'image_urls']
                ] // these are queried concurrently
            ]

            expect(result).to.deep.equal(goal)
        })
        test('handles multiple top level props', () => {
            const query = {
                vendors: {
                    id: true
                },
                products: {
                    id: true
                }
            }

            const result = get_query_plan(query)

            const goal = [[['vendors'], ['products']]]

            expect(result).to.deep.equal(goal)
        })
        test('handles renamed queries', () => {
            const query = {
                my_products: {
                    $from: 'products',
                    id: true
                }
            }

            const result = get_query_plan(query)

            const goal = [[['my_products']]]

            expect(result).to.deep.equal(goal)
        })
    })
})