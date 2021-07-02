import { expect } from 'chai'
import { describe, test } from 'mocha'
import { lir_join } from '../helpers/lir_join'

describe('nester', () => {
    test.only('basic deep nesting', () => {
        const data = [
            [['vendors'], [{id: 1}, {id: 2}]],
            [['vendors', 0, 'products'], [{ id: 1, vendor_id: 2}]],
            [['vendors', 0,'products', 0, 'images'], [{product_id: 1}, {product_id: 1}]]
        ]

        const edges = [
            { from_entity: 'vendors', from_field: 'id', to_entity: 'products', to_field: 'vendor_id'},
            { from_entity: 'products', from_field: 'id', to_entity: 'images', to_field: 'product_id'},
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

        const left_list = data[0][1]
        const inner_list = []
        const right_list = data[1][1]
        const left_fn = (el) => edges[0].from_field
        const inner_fn = (l,i,r) => {

            return i
        }
        const right_fn = (el) => edges[0].to_field

        const result = lir_join(left_list, inner_list, right_list, left_fn, inner_fn, right_fn)


        expect(result).to.deep.equal(goal)

    })
    test('object nesting', () => {
        const data = [
            [['vendors'], [{id: 1}, {id: 2}]],
            [['vendors', 'products'], [{ id: 1, vendor_id: 2}]],
        ]

        const edges = [
            { from_entity: 'vendors', from_field: 'id', to_entity: 'products', to_field: 'vendor_id'},
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