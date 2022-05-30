import { expect } from 'chai'
import { describe, test } from 'mocha'
import { diff_mutation } from './diff_mutation'

describe('diff_mutation.ts', () => {
    test('diffs objects preserving ids', () => {
        const original = { id: 2, title: null, body_html: 'Computer' }
        const modified = { id: 2, title: 'pc', body_html: 'Computer' }
        const update_obj = diff_mutation(original, modified)
        expect(update_obj).to.deep.equal({
            $operation: 'update',
            id: 2,
            title: 'pc',
        })
    })
    test('diffs deeply', () => {
        const original = {
            id: 1,
            product: {
                id: 2,
                title: null,
                body_html: 'Computer',
                old_column: 'hi',
            },
        }
        const modified = {
            id: 1,
            product: {
                id: 2,
                title: 'pc',
                body_html: 'Computer',
                new_column: 'ho',
            },
        }
        const update_obj = diff_mutation(original, modified)
        expect(update_obj).to.deep.equal({
            id: 1,
            $operation: 'update',
            product: {
                $operation: 'update',
                id: 2,
                title: 'pc',
                old_column: undefined,
                new_column: 'ho',
            },
        })
    })

    test('Deletes missing array items', () => {
        // Notice it matches by id not position in array
        const original = [
            { id: 1, sku: 'deleteme' },
            { id: 2, sku: 'mysku' },
        ]
        const modified = [{ id: 2, sku: 'mysku' }]
        const update_obj = diff_mutation(original, modified)

        expect(update_obj).to.deep.equal([
            {
                $operation: 'delete',
                id: 1,
            },
        ])
    })
    test('Adds missing array items', () => {
        // Notice it matches by id not position in array
        const original = []
        const modified = [{ sku: 'mysku' }]
        const update_obj = diff_mutation(original, modified)

        expect(update_obj).to.deep.equal([
            {
                $operation: 'create',
                sku: 'mysku',
            },
        ])
    })
    test('Modifies array items', () => {
        const original = [{ id: 2, sku: 'mysku' }]
        const modified = [{ id: 2, sku: 'mysku2' }]
        const update_obj = diff_mutation(original, modified)

        expect(update_obj).to.deep.equal([
            {
                $operation: 'update',
                id: 2,
                sku: 'mysku2',
            },
        ])
    })
    test('Knows if items were moved', () => {
        const original = [
            { id: 1, label: 'a' },
            { id: 2, label: 'b' },
        ]
        const modified = [
            { id: 2, label: 'b' },
            { id: 1, label: 'a' },
        ]
        const update_obj = diff_mutation(original, modified)

        expect(update_obj).to.deep.equal([])
    })
    test('Can add elements to nested places', () => {
        const original = { id: 3 }
        const modified = { id: 3, variants: [{ title: 'computer' }] }
        const update_obj = diff_mutation(original, modified)

        expect(update_obj).to.deep.equal({
            id: 3,
            $operation: 'update',
            variants: [
                {
                    $operation: 'create',
                    title: 'computer',
                },
            ],
        })
    })
    test('Excludes identical arrays', () => {
        const original = { id: 3, products: [{ id: 1, title: 'pc' }] }
        const modified = { id: 3, products: [{ id: 1, title: 'pc' }] }
        const update_obj = diff_mutation(original, modified)

        expect(update_obj).to.deep.equal({})
    })
    test('Top level create - null', () => {
        const original = null
        const modified = { note: 'some data' }
        const update_obj = diff_mutation(original, modified)

        expect(update_obj).to.deep.equal({
            $operation: 'create',
            note: 'some data',
        })
    })
    test.skip('Top level create with nesting', () => {
        const original = null
        const modified = {
            variants: [
                {
                    images: [
                        {
                            url: 'test',
                        },
                    ],
                },
            ],
        }
        const update_obj = diff_mutation(original, modified)

        expect(update_obj).to.deep.equal({
            $operation: 'create',
            variants: [
                {
                    $operation: 'create',
                    images: [
                        {
                            $operation: 'create',
                            url: 'test',
                        },
                    ],
                },
            ],
        })
    })
})
