import { expect } from 'chai'
import { describe, test } from 'mocha'
import { nester, NesterData } from '../nester'

describe('nester', () => {
    test('basic deep nesting', async () => {
        const data: NesterData = [
            [
                ['vendors', 0],
                [{ id: 1 }, { id: 2 }],
            ],
            [['vendors', 0, 'products', 0], [{ id: 1, vendor_id: 2 }]],
            [
                ['vendors', 0, 'products', 0, 'images', 0],
                [{ product_id: 1 }, { product_id: 1 }],
            ],
        ]

        const edges = [null, ['id', 'vendor_id'], ['id', 'product_id']]

        const goal = {
            vendors: [
                {
                    id: 1,
                },
                {
                    id: 2,
                    products: [
                        {
                            id: 1,
                            vendor_id: 2,
                            images: [
                                {
                                    product_id: 1,
                                },
                                {
                                    product_id: 1,
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        let result = nester(data, edges)

        expect(result).to.deep.equal(goal)
    })
    test('handles entities with no children', async () => {
        const data: NesterData = [
            [['vendors', 0], [{ id: 1 }]],
            [['images', 0], [{ id: 1 }]],
            [
                ['vendors', 0, 'products', 0],
                [
                    { id: 1, vendor_id: 1 },
                    { id: 2, vendor_id: 1 },
                ],
            ],
        ]

        const edges = [null, null, ['id', 'vendor_id']]

        const goal = {
            images: [
                {
                    id: 1,
                },
            ],
            vendors: [
                {
                    id: 1,
                    products: [
                        {
                            id: 1,
                            vendor_id: 1,
                        },
                        {
                            id: 2,
                            vendor_id: 1,
                        },
                    ],
                },
            ],
        }

        let result = nester(data, edges)

        expect(result).to.deep.equal(goal)
    })
    test('handles sibling nesting', async () => {
        const data: NesterData = [
            [['vendors', 0], [{ id: 1 }]],
            [['images', 0], [{ id: 1 }]],
            [
                ['images', 0, 'child_images', 0],
                [
                    { id: 1, image_id: 1 },
                    { id: 2, image_id: 1 },
                ],
            ],
            [
                ['vendors', 0, 'products', 0],
                [
                    { id: 1, vendor_id: 1 },
                    { id: 2, vendor_id: 1 },
                ],
            ],
        ]

        const edges = [null, null, ['id', 'image_id'], ['id', 'vendor_id']]

        const goal = {
            images: [
                {
                    id: 1,
                    child_images: [
                        {
                            id: 1,
                            image_id: 1,
                        },
                        {
                            id: 2,
                            image_id: 1,
                        },
                    ],
                },
            ],
            vendors: [
                {
                    id: 1,
                    products: [
                        {
                            id: 1,
                            vendor_id: 1,
                        },
                        {
                            id: 2,
                            vendor_id: 1,
                        },
                    ],
                },
            ],
        }

        let result = nester(data, edges)

        expect(result).to.deep.equal(goal)
    })
    test('object nesting', () => {
        const data: NesterData = [
            [
                ['vendors', 0],
                [{ id: 1 }, { id: 2 }],
            ],
            [['vendors', 0, 'products'], [{ id: 1, vendor_id: 2 }]],
        ]

        const edges = [null, ['id', 'vendor_id']]

        const goal = {
            vendors: [
                {
                    id: 1,
                },
                {
                    id: 2,
                    products: {
                        id: 1,
                        vendor_id: 2,
                    },
                },
            ],
        }

        let result = nester(data, edges)

        expect(result).to.deep.equal(goal)
    })
    test('handles nesting same object multiple times', () => {
        const data: NesterData = [
            [
                ['variants', 0],
                [
                    { id: 10, product_id: 1 },
                    { id: 11, product_id: 1 },
                ],
            ],
            [['variants', 0, 'products', 0], [{ id: 1 }]],
        ]

        const edges = [null, ['product_id', 'id']]

        const goal = {
            variants: [
                {
                    id: 10,
                    product_id: 1,
                    products: [
                        {
                            id: 1,
                        },
                    ],
                },
                {
                    id: 11,
                    product_id: 1,
                    products: [
                        {
                            id: 1,
                        },
                    ],
                },
            ],
        }

        let result = nester(data, edges)

        expect(result).to.deep.equal(goal)
    })

    test.skip('breadth speed test', async () => {
        const vendors = new Array(100).fill(undefined).map((_, i) => ({
            id: Math.random() * 1000000000000000,
        }))

        const products = vendors.flatMap((vendor, i) => {
            return new Array(100).fill(undefined).map((_, i) => ({
                id: Math.random() * 1000000000000000,
                vendor_id: vendor.id,
            }))
        })

        console.log('generated products')

        const images = products.flatMap((product, i) => {
            return new Array(100).fill(undefined).map((_, i) => ({
                id: Math.random() * 1000000000000000,
                product_id: product.id,
            }))
        })

        const data: NesterData = [
            [['vendors', 0], vendors],
            [['vendors', 0, 'products', 0], products],
            [['vendors', 0, 'products', 0, 'images', 0], images],
        ]

        // const edges = [
        //     {
        //         from_entity: 'vendors',
        //         from_field: 'id',
        //         to_entity: 'products',
        //         to_field: 'vendor_id',
        //     },
        //     {
        //         from_entity: 'products',
        //         from_field: 'id',
        //         to_entity: 'images',
        //         to_field: 'product_id',
        //     },
        // ]

        const edges = [null, ['id', 'vendor_id'], ['id', 'product_id']]

        const goal = {
            vendors: [
                {
                    id: 1,
                },
                {
                    id: 2,
                    products: [
                        {
                            id: 1,
                            vendor_id: 2,
                            images: [
                                {
                                    product_id: 1,
                                },
                                {
                                    product_id: 1,
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        console.time('t')

        let result = {}
        // for (let i = 0; i < 10000; i++) {
        result = nester(data, edges)
        // }
        console.timeEnd('t')

        console.log('done')
        // expect(result).to.deep.equal(goal)
    })
    test('Nest same item into multiple spots should make a copy', () => {
        // This is a test for a bug that was found in the code.
        // The bug was that the same item was being added to multiple places
        // and the user expects data to be copied to each spot.

        const data: NesterData = [
            [
                ['order_items', 0],
                [
                    { id: 1, variant_id: 11 },
                    { id: 2, variant_id: 11 },
                ],
            ],
            [['order_items', 0, 'variants', 0], [{ product_id: 111, id: 11 }]],
            [['order_items', 0, 'variants', 0, 'products', 0], [{ id: 111 }]],
        ]

        const edges = [null, ['variant_id', 'id'], ['product_id', 'id']]

        const result: any = nester(data, edges)
        const len = result.order_items[0].variants[0].products.length
        expect(len).to.equal(1)
        // these should be a copy, not referentially equal
        expect(result.order_items[0].variants[0]).to.not.equal(
            result.order_items[1].variants[0]
        )
    })
})
