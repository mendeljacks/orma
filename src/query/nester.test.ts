import { expect } from 'chai'
import { describe, test } from 'mocha'
import { nester } from '../helpers/nester'

describe.only('nester', () => {
    test('basic deep nesting', async () => {
        const data = [
            [['vendors', 0], [{ id: 1 }, { id: 2 }]],
            [['vendors', 0, 'products', 0], [{ id: 1, vendor_id: 2 }]],
            [['vendors', 0, 'products', 0, 'images', 0], [{ product_id: 1 }, { product_id: 1 }]]
        ]

        const edges = [
            { from_entity: 'vendors', from_field: 'id', to_entity: 'products', to_field: 'vendor_id' },
            { from_entity: 'products', from_field: 'id', to_entity: 'images', to_field: 'product_id' },
        ]

        const goal = {
            vendors: [{
                id: 1
            }, {
                id: 2,
                products: [{
                    id: 1,
                    vendor_id: 2,
                    images: [{
                        product_id: 1
                    }, {
                        product_id: 1
                    }]
                }]
            }]
        }

        console.time('t')

        let result = nester(data, edges)
        console.timeEnd('t')


        expect(result).to.deep.equal(goal)

    })
    test('object nesting', () => {
        const data = [
            [['vendors', 0], [{ id: 1 }, { id: 2 }]],
            [['vendors', 0, 'products'], [{ id: 1, vendor_id: 2 }]],
        ]

        const edges = [
            { from_entity: 'vendors', from_field: 'id', to_entity: 'products', to_field: 'vendor_id' },
        ]


        const goal = {
            vendors: [{
                id: 1
            }, {
                id: 2,
                products: {
                    id: 1,
                    vendor_id: 2
                }
            }]
        }

        console.time('t')

        let result = nester(data, edges)
        // let result = {}
        // for (let i = 0; i < 10000; i++) {
        //     result = nester(data, edges)
        // }
        // await stop_profiler()
        // console.timeEnd('t')


        expect(result).to.deep.equal(goal)
    })




    test.skip('breadth speed test', async () => {
        const vendors = new Array(100).fill(undefined).map((_, i) => ({
            id: Math.random() * 1000000000000000
        }))

        const products = vendors.flatMap((vendor, i) => {
            return new Array(100).fill(undefined).map((_, i) => ({
                id: Math.random() * 1000000000000000,
                vendor_id: vendor.id
            }))
        })

        console.log('generated products')

        const images = products.flatMap((product, i) => {
            return new Array(100).fill(undefined).map((_, i) => ({
                id: Math.random() * 1000000000000000,
                product_id: product.id
            }))
        })

        const data = [
            [['vendors'], vendors],
            [['vendors', 0, 'products'], products],
            [['vendors', 0, 'products', 0, 'images'], images]
        ]

        const edges = [
            { from_entity: 'vendors', from_field: 'id', to_entity: 'products', to_field: 'vendor_id' },
            { from_entity: 'products', from_field: 'id', to_entity: 'images', to_field: 'product_id' },
        ]

        const goal = {
            vendors: [{
                id: 1
            }, {
                id: 2,
                products: [{
                    id: 1,
                    vendor_id: 2,
                    images: [{
                        product_id: 1
                    }, {
                        product_id: 1
                    }]
                }]
            }]
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

})