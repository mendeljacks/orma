import { expect } from 'chai'
import { describe, test } from 'mocha'
import { extract_subpaths } from '../helpers/extract_subpaths'
import { deep_get, deep_set, drop_last, last } from '../helpers/helpers'
import { lir_join } from '../helpers/lir_join'
import { nester } from '../helpers/nester'
import { push_path } from '../helpers/push_path'
import { start_profiler, stop_profiler } from './benchmark'

describe('nester', () => {
    test.only('basic deep nesting', async () => {
        const data = [
            [['vendors'], [{ id: 1 }, { id: 2 }]],
            [['vendors', 0, 'products'], [{ id: 1, vendor_id: 2 }]],
            [['vendors', 0, 'products', 0, 'images'], [{ product_id: 1 }, { product_id: 1 }]]
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

        await start_profiler()
        let result = {}
        for (let i = 0; i < 10000; i++) {
            result = nester(data, edges)
        }
        await stop_profiler()
        console.timeEnd('t')


        expect(result).to.deep.equal(goal)

    })
    test('object nesting', () => {
        const data = [
            [['vendors'], [{ id: 1 }, { id: 2 }]],
            [['vendors', 'products'], [{ id: 1, vendor_id: 2 }]],
        ]

        const edges = [
            { from_entity: 'vendors', from_field: 'id', to_entity: 'products', to_field: 'vendor_id' },
        ]


        const expected = {
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
    })
})