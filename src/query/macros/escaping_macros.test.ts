import { describe, test } from 'mocha'
import { apply_escaping_macro, apply_field_macro } from './escaping_macros'
import { expect } from 'chai'

describe('escaping_macros', () => {
    describe(apply_escaping_macro.name, () => {
        test('escapes primitives and ignores $raw', () => {
            const query = {
                my_products: {
                    $from: 'products',
                    $where: {
                        $in: [{ $raw: 'created_at' }, [new Date('2021-01-02'), 12]],
                    },
                },
            }

            apply_escaping_macro(query, (value, path) => {
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
                    $from: '"products"',
                    $where: {
                        $in: ['created_at', ['"2021-01-02"', 12]],
                    },
                },
            })
        })
        test('handles nested $raws', () => {
            const query = {
                $raw: {
                    $raw: {
                        in: [
                            {
                                $raw: 'id',
                            },
                            {
                                $raw: [1],
                            },
                        ],
                    },
                },
            }

            apply_escaping_macro(query, (value, path) => 'test')

            expect(query).to.deep.equal({
                in: ['id', [1]],
            })
        })
    })
    describe(apply_field_macro.name, () => {
        test('converts $field to $raw', () => {
            const query = {
                my_products: {
                    $from: {
                        $field: 'products'
                    }
                }
            }

            apply_field_macro(query)

            expect(query).to.deep.equal({
                my_products: {
                    $from: {
                        $raw: 'products'
                    }
                }
            })
        })
    })
})
