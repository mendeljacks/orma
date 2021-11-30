import { describe, test } from 'mocha'
import { apply_escape_macro } from './escaping_macros'
import { expect } from 'chai'

describe('escaping_macros', () => {
    describe(apply_escape_macro.name, () => {
        test('escapes primitives', () => {
            const query = {
                my_products: {
                    $from: 'products',
                    $where: {
                        $in: [
                            { $escape: 'created_at' },
                            [
                                { $escape: new Date('2021-01-02') },
                                { $escape: 12 },
                            ],
                        ],
                    },
                },
            }

            apply_escape_macro(query, value => {
                if (typeof value === 'string') {
                    return `"${value}"`
                } else if (value instanceof Date) {
                    return `"2021-01-02"`
                } else {
                    return value
                }
            })

            expect(query).to.deep.equal({
                my_products: {
                    $from: 'products',
                    $where: {
                        $in: ['"created_at"', ['"2021-01-02"', 12]],
                    },
                },
            })
        })
        test('handles nested $escapes', () => {
            const query = {
                in: ['column', { $escape: [{
                    $escape: 'val'
                }]}]
            }

            apply_escape_macro(query, value => {
                if (Array.isArray(value)) {
                    return value
                } else {
                    return `"${value}"`
                }
            })

            expect(query).to.deep.equal({
                in: ['column', ['"val"']],
            })
        })
    })
})
