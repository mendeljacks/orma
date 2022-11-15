import { describe, test } from 'mocha'
import { apply_escape_macro } from './escaping_macros'
import { expect } from 'chai'
import { OrmaSchema } from '../../introspector/introspector'

const orma_schema: OrmaSchema = {
    $entities: {
        products: {
            $database_type: 'mysql',
            $fields: {}
        },
    },
}

describe('escaping_macros', () => {
    describe(apply_escape_macro.name, () => {
        test('Can determine database type from $as', () => {
            const query = {
                products: {
                    id: true,
                    $select: [
                        {
                            $as: [
                                { $coalesce: ['count', { $escape: 0 }] },
                                'my_id',
                            ],
                        },
                    ],
                },
            }

            apply_escape_macro(query, orma_schema)
        })
        test('Can find database type $coalesce', () => {
            const orma_schema: OrmaSchema = {
                $entities: {
                    places: { $database_type: 'postgres', $fields: {} },
                    reviews: { $database_type: 'postgres', $fields: {} },
                },
            }
            const query = {
                places: {
                    id: true,
                    $select: [
                        {
                            $as: [
                                {
                                    $select: [
                                        {
                                            $coalesce: [
                                                { $max: 'created_at' },
                                                { $escape: '1996-01-01' },
                                            ],
                                        },
                                    ],
                                    $from: 'reviews',
                                },
                                'latest_review',
                            ],
                        },
                    ],
                },
            }

            apply_escape_macro(query, orma_schema)
        })
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

            apply_escape_macro(query, orma_schema)

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
                products: {
                    $where: {
                        $in: [
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
                    },
                },
            }

            apply_escape_macro(query, orma_schema)

            expect(query).to.deep.equal({
                products: {
                    $where: {
                        $in: ['column', ["'\\'val\\''"]],
                    },
                },
            })
        })
        test('handles null', () => {
            const query = {
                products: {
                    $where: {
                        $eq: [1, { $escape: null }],
                    },
                },
            }

            apply_escape_macro(query, orma_schema)

            expect(query.products.$where).to.deep.equal({
                $eq: [1, 'NULL'],
            })
        })
    })
})
