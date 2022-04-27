import { describe, test } from 'mocha'
import { apply_escape_macro } from './escaping_macros'
import { expect } from 'chai'

describe.only('escaping_macros', () => {
    describe(apply_escape_macro.name, () => {
        test('escapes primitives', () => {
            const query = {
                my_products: {
                    $from: 'products',
                    $where: {
                        $in: [
                            { $escape: 'created_at' },
                            [
                                { $escape: new Date(Date.UTC(2021, 0, 2)) },
                                { $escape: 12 },
                            ],
                        ],
                    },
                },
            }

            apply_escape_macro(query)

            expect(query).to.deep.equal({
                my_products: {
                    $from: 'products',
                    $where: {
                        $in: [
                            "'created_at'",
                            ["'2021-01-02 00:00:00.000'", 12],
                        ],
                    },
                },
            })
        })
        test('handles nested $escapes', () => {
            const query = {
                in: [
                    'column',
                    [
                        {
                            $escape: [
                                {
                                    $escape: 'val',
                                },
                            ],
                        },
                    ],
                ],
            }

            apply_escape_macro(query)

            expect(query).to.deep.equal({
                in: ['column', ["'\\'val\\''"]],
            })
        })
    })
})
