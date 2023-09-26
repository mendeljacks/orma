import { expect } from 'chai'
import { describe, test } from 'mocha'
import { extract_subpaths } from '../extract_subpaths'
import { deep_get } from '../helpers'
import { lir_join } from '../lir_join'
import { push_path } from '../push_path'

describe('lir_join', () => {
    test('Merges flat lists', () => {
        const products = [{ id: 1, title: 'Laptop' }]
        const product_in_stores = [{ product_id: 1, store_id: 1 }]
        const goal = [
            {
                id: 1,
                title: 'Laptop',
                product_in_stores: [{ product_id: 1, store_id: 1 }],
            },
        ]

        const { left, inner, right } = lir_join(
            products,
            [] as any,
            product_in_stores,
            el => el.id,
            (l, i, r) => {
                i.push({ ...l[0], product_in_stores: r })
                return i
            },
            el => el.product_id
        )

        expect(left).to.deep.equal([])
        expect(inner).to.deep.equal(goal)
        expect(right).to.deep.equal([])
    })

    test('Nests many entities to one location (right to left)', () => {
        const products = [{ id: 1, title: 'Laptop' }]
        const product_in_stores = [
            { product_id: 1, store_id: 1 },
            { product_id: 1, store_id: 2 },
        ]
        const goal = [
            {
                id: 1,
                title: 'Laptop',
                product_in_stores: [
                    { product_id: 1, store_id: 1 },
                    { product_id: 1, store_id: 2 },
                ],
            },
        ]

        const { left, inner, right } = lir_join(
            products,
            [] as any[],
            product_in_stores,
            el => el.id,
            (l, i, r) => {
                i.push({ ...l[0], product_in_stores: r })
                return i
            },
            el => el.product_id
        )

        expect(left).to.deep.equal([])
        expect(inner).to.deep.equal(goal)
        expect(right).to.deep.equal([])
    })
    test('Nests many entities to one location (left to right)', () => {
        const products = [{ id: 1, title: 'Laptop' }]
        const product_in_stores = [
            { product_id: 1, store_id: 1 },
            { product_id: 1, store_id: 2 },
        ]
        const goal = [
            {
                id: 1,
                title: 'Laptop',
                product_in_stores: [
                    { product_id: 1, store_id: 1 },
                    { product_id: 1, store_id: 2 },
                ],
            },
        ]

        const { left, inner, right } = lir_join(
            product_in_stores,
            [] as any[],
            products,
            el => el.product_id,
            (l, i, r) => {
                i.push({ ...r[0], product_in_stores: l })
                return i
            },
            el => el.id
        )

        expect(left).to.deep.equal([])
        expect(inner).to.deep.equal(goal)
        expect(right).to.deep.equal([])
    })

    test('Deeply nests', () => {
        // This is a deep nest because images are going on the variant which is on the product
        // The example includes a scenario with multiple images on a variant
        // The example includes a variant with no images (the pink one)
        // And images that don't belong to a variant (the purple one)

        // Setup
        const products = [
            {
                id: 1,
                title: 'Phone',
                variants: [{ id: 11, sku: 'phne1' }],
            },
            {
                id: 2,
                title: 'Tissue Box',
                variants: [
                    { id: 22, sku: 'tssu1-green' },
                    { id: 33, sku: 'tssu1-blue' },
                    { id: 44, sku: 'tssu1-pink' },
                ],
            },
        ]
        const images = [
            { id: 111, variant_id: 11, bucket_url: 'http://www.phone.jpg' },
            { id: 222, variant_id: 22, bucket_url: 'http://www.tbgreen.jpg' },
            { id: 333, variant_id: 33, bucket_url: 'http://www.tbblue1.jpg' },
            { id: 444, variant_id: 33, bucket_url: 'http://www.tbblue2.jpg' },
            {
                id: 555,
                variant_id: 55,
                bucket_url: 'http://www.stray.purple.jpg',
            },
        ]
        const goal = [
            {
                id: 1,
                title: 'Phone',
                variants: [
                    {
                        id: 11,
                        sku: 'phne1',
                        images: [
                            {
                                id: 111,
                                variant_id: 11,
                                bucket_url: 'http://www.phone.jpg',
                            },
                        ],
                    },
                ],
            },
            {
                id: 2,
                title: 'Tissue Box',
                variants: [
                    {
                        id: 22,
                        sku: 'tssu1-green',
                        images: [
                            {
                                id: 222,
                                variant_id: 22,
                                bucket_url: 'http://www.tbgreen.jpg',
                            },
                        ],
                    },
                    {
                        id: 33,
                        sku: 'tssu1-blue',
                        images: [
                            {
                                id: 333,
                                variant_id: 33,
                                bucket_url: 'http://www.tbblue1.jpg',
                            },
                            {
                                id: 444,
                                variant_id: 33,
                                bucket_url: 'http://www.tbblue2.jpg',
                            },
                        ],
                    },
                    { id: 44, sku: 'tssu1-pink' },
                ],
            },
        ]

        const { left, inner, right } = lir_join(
            extract_subpaths([0, 'variants', 0], products),
            products,
            images,
            left_el => deep_get([...left_el, 'id'], products),
            (l, i, r) => {
                // for each image, mutate inner
                // placing the element at correct subpath with images appended to path
                r.forEach(right_adjacent =>
                    push_path([...l[0], 'images'], right_adjacent, i)
                )
                return i
            },
            el => el.variant_id
        )

        expect(left.map(left_el => deep_get(left_el, products))).to.deep.equal([
            { id: 44, sku: 'tssu1-pink' },
        ])
        expect(inner).to.deep.equal(goal)
        expect(right).to.deep.equal([
            {
                id: 555,
                variant_id: 55,
                bucket_url: 'http://www.stray.purple.jpg',
            },
        ])
    })
    test('Accepts undefined as if it was a string', () => {
        // obj[undefined] in js is the same as obj['undefined']
        const list1 = [1, 2, 3]
        const list2 = [2, 4, 6, undefined]

        const { left, inner, right } = lir_join(
            list1,
            [] as any[],
            list2,
            el => el,
            (l, i, r) => {
                i.push(l[0])
                return i
            },
            el => el
        )

        expect(left).to.deep.equal([1, 3])
        expect(inner).to.deep.equal([2])
        expect(right).to.deep.equal([4, 6, undefined])
    })
    test('Accepts undefined as if it was a string in object', () => {
        // obj[undefined] in js is the same as obj['undefined']
        const original = [{ id: 6, quantity: 1, reason: 'customer' }]
        const modified = [{ quantity: 1, reason: 'customer', id: undefined }]

        const { left, inner, right } = lir_join(
            original,
            [] as any[],
            modified,
            x => x.id,
            (l, i, r) => {
                // if (l.length !== 1 || r.length !== 1) throw new Error('You must not have arrays where id is same across more than one entry eg [{id:2},{id:2}]')
                // const left_obj = l[0]
                // const right_obj = r[0]
                // if (!equals(left_obj, right_obj)) {
                //     const update_obj = make_update_obj(left_obj, right_obj)
                //     i.push(update_obj)
                // }
                return i
            },
            x => x.id
        )

        expect(left).to.deep.equal(original)
        expect(inner).to.deep.equal([])
        expect(right).to.deep.equal(modified)
    })

    test.skip('preserves order of elements in array')

    test.skip('Nests multiple entities', () => {
        const variants = [{ id: 1, sku: 'mysku1' }]
        const variant_in_stores = [{ variant_id: 1, price: 19.99 }]
        const images = [{ variant_id: 1, bucket_url: 'http:...' }]
    })
    test.skip('Flips nests deeply', () => {
        const orders = []
        const boxes = []

        // chain prop it
        // weld it

        // turn o -> oi -> oif -> box
        // into b -> oif -> oi -> o
    })

    test.skip('Merges lists', () => {
        const products1 = [
            { id: 1, title: 'title1' },
            { id: 2, title: 'title2' },
        ]
        const products2 = [
            { id: 2, title: 'title22' },
            { id: 3, title: 'title3' },
        ]

        // should get a list with 1, 2 (merged) and 3
    })

    test.skip('Handle more than 126,000 remainder in a list', () => {})
})
