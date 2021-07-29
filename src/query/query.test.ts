import { expect } from 'chai'
import { describe, test } from 'mocha'
import { format } from 'sql-formatter'
import { orma_schema } from '../introspector/introspector'
import {
    convert_any_path_macro,
    get_query_plan,
    get_subquery_sql,
    is_subquery,
    json_to_sql,
    orma_query,
    query_to_json_sql
} from './query'

describe('query', () => {
    const orma_schema: orma_schema = {
        products: {
            id: {},
            vendor_id: {
                references: {
                    vendors: {
                        id: {}
                    }
                }
            }
        },
        vendors: {
            id: {}
        },
        images: {
            id: {},
            product_id: {
                references: {
                    products: {
                        id: {}
                    }
                }
            }
        },
        image_urls: {
            image_id: {
                references: {
                    images: {
                        id: {}
                    }
                }
            }
        }
    }

    describe('json_to_sql', () => {
        test('joins commands', () => {
            const json = {
                $select: ['a'],
                $from: 'b'
            }

            const sql = format(json_to_sql(json))
            const goal = format(`SELECT a FROM b`)

            expect(sql).to.equal(goal)
        })
        test('nested command work', () => {
            const json = {
                $where: {
                    $eq: ['a', 'b']
                }
            }

            const sql = format(json_to_sql(json))
            const goal = format('WHERE a = b')

            expect(sql).to.equal(goal)
        })
        test("'not' command works", () => {
            const json = {
                $not: {
                    $in: ['a', [1, 2]]
                }
            }

            const sql = format(json_to_sql(json))
            const goal = format('a NOT IN (1, 2)')

            expect(sql).to.equal(goal)
        })
        test('ignores undefined properties', () => {
            const json = {
                $having: undefined
            }
            const sql = format(json_to_sql(json))
            const goal = format('')

            expect(sql).to.equal(goal)
        })
    })
    describe('get_query_plan', () => {
        test('splits by $where clause and $having', () => {
            const query = {
                vendors: {
                    products: {
                        $where: { $eq: ['id', 0] },
                        vins: {
                            id: true
                        },
                        images: {
                            image_urls: {
                                $having: { $eq: ['id', 0] },
                                id: true
                            }
                        }
                    }
                }
            }

            const result = get_query_plan(query)

            // the split happens at variants because it has a where clause
            const goal = [
                [['vendors'], ['vendors', 'products']], // first these should be run concurrently
                [
                    ['vendors', 'products', 'vins'],
                    ['vendors', 'products', 'images'],
                    ['vendors', 'products', 'images', 'image_urls']
                ] // then this will be queried
            ]

            expect(result).to.deep.equal(goal)
        })
        test('handles multiple top level props', () => {
            const query = {
                vendors: {
                    id: true
                },
                products: {
                    id: true
                }
            }

            const result = get_query_plan(query)

            // the split happens at variants because it has a where clause
            const goal = [[['vendors'], ['products']]]

            expect(result).to.deep.equal(goal)
        })
        test('handles renamed queries', () => {
            const query = {
                my_products: {
                    $from: 'products',
                    id: true
                }
            }

            const result = get_query_plan(query)

            // the split happens at variants because it has a where clause
            const goal = [[['my_products']]]

            expect(result).to.deep.equal(goal)
        })
    })
    describe('is_subquery', () => {
        test('is subquery', () => {
            const result = is_subquery({
                $from: 'products',
                id: {}
            })

            expect(result).to.equal(true)
        })
        test('not subquery', () => {
            const result = is_subquery({
                $from: 'products'
            })

            expect(result).to.equal(false)
        })
    })
    describe('convert_any_clauses', () => {
        test('multiple any clauses', () => {
            const where = {
                $and: [
                    {
                        $any: [
                            ['images'],
                            {
                                $eq: ['id', 1]
                            }
                        ]
                    },
                    {
                        $any: [
                            ['vendors'],
                            {
                                $eq: ['id', 1]
                            }
                        ]
                    }
                ]
            }

            const converted_where = convert_any_path_macro(where, 'products', false, orma_schema)
            const goal = {
                $and: [
                    {
                        $in: [
                            'id',
                            {
                                $select: ['product_id'],
                                $from: 'images',
                                $where: {
                                    $eq: ['id', 1]
                                }
                            }
                        ]
                    },
                    {
                        $in: [
                            'vendor_id',
                            {
                                $select: ['id'],
                                $from: 'vendors',
                                $where: {
                                    $eq: ['id', 1]
                                }
                            }
                        ]
                    }
                ]
            }
            expect(converted_where).to.deep.equal(goal)
        })
        test('deep any path', () => {
            const where = {
                $any: [
                    ['images', 'image_urls'],
                    {
                        $eq: ['id', 1]
                    }
                ]
            }

            const converted_where = convert_any_path_macro(where, 'products', false, orma_schema)
            const goal = {
                $in: [
                    'id',
                    {
                        $select: ['product_id'],
                        $from: 'images',
                        $where: {
                            $in: [
                                'id',
                                {
                                    $select: ['image_id'],
                                    $from: 'image_urls',
                                    $where: {
                                        $eq: ['id', 1]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
            expect(converted_where).to.deep.equal(goal)
        })
        test('nested anys', () => {
            const where = {
                $any: [
                    ['images'],
                    {
                        $any: [
                            ['image_urls'],
                            {
                                $eq: ['id', 1]
                            }
                        ]
                    }
                ]
            }

            const converted_where = convert_any_path_macro(where, 'products', false, orma_schema)
            const goal = {
                $in: [
                    'id',
                    {
                        $select: ['product_id'],
                        $from: 'images',
                        $where: {
                            $in: [
                                'id',
                                {
                                    $select: ['image_id'],
                                    $from: 'image_urls',
                                    $where: {
                                        $eq: ['id', 1]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
            expect(converted_where).to.deep.equal(goal)
        })
        test('uses having', () => {
            const where = {
                $any: [
                    ['images'],
                    {
                        $eq: ['id', 1]
                    }
                ]
            }

            const converted_where = convert_any_path_macro(where, 'products', true, orma_schema)
            const goal = {
                $in: [
                    'id',
                    {
                        $select: ['product_id'],
                        $from: 'images',
                        $having: {
                            $eq: ['id', 1]
                        }
                    }
                ]
            }
            expect(converted_where).to.deep.equal(goal)
        })
    })
    describe('query_to_json_sql', () => {
        test('handles selects/handles root', () => {
            const query = {
                products: {
                    id: true,
                    my_title: 'title',
                    total_quantity: {
                        $sum: 'quantity'
                    }
                }
            }

            const json_sql = query_to_json_sql(query, ['products'], [], {})
            const goal = {
                $select: [
                    'id',
                    { $as: ['title', 'my_title'] },
                    { $as: [{ $sum: 'quantity' }, 'total_quantity'] }
                ],
                $from: 'products'
            }

            expect(json_sql).to.deep.equal(goal)
        })
        test('handles root nesting', () => {
            const query = {
                products: {
                    id: true,
                    images: {
                        id: true,
                        product_id: true
                    }
                }
            }

            const previous_results = [[['products'], [{ id: 1 }, { id: 2 }]]]
            const json_sql = query_to_json_sql(
                query,
                ['products', 'images'],
                previous_results,
                orma_schema
            )
            const goal = {
                $select: ['id', 'product_id'],
                $from: 'images',
                $where: {
                    $in: ['product_id', [1, 2]]
                }
            }

            expect(json_sql).to.deep.equal(goal)
        })
        test('handles adding foreign keys', () => {
            const query = {
                products: {
                    images: { url: true }
                }
            }

            const previous_results = [[['products'], [{ id: 1 }, { id: 2 }]]]
            const json_sql1 = query_to_json_sql(query, ['products'], previous_results, orma_schema)
            const goal1 = {
                $select: ['id'],
                $from: 'products'
            }

            const json_sql2 = query_to_json_sql(
                query,
                ['products', 'images'],
                previous_results,
                orma_schema
            ) as any
            json_sql2?.$select?.sort()
            const goal2 = {
                $select: ['product_id', 'url'].sort(),
                $from: 'images',
                $where: {
                    $in: ['product_id', [1, 2]]
                }
            }

            expect(json_sql1).to.deep.equal(goal1)
            expect(json_sql2).to.deep.equal(goal2)
        })
        test('handles deep nesting', () => {
            const query = {
                products: {
                    images: {
                        image_urls: {
                            id: true
                        }
                    }
                }
            }

            const previous_results = [[['products'], [{ id: 1 }, { id: 2 }]]]
            const json_sql = query_to_json_sql(
                query,
                ['products', 'images', 'image_urls'],
                previous_results,
                orma_schema
            ) as any
            json_sql?.$select?.sort()
            const goal = {
                $select: ['image_id', 'id'].sort(),
                $from: 'image_urls',
                $where: {
                    $in: [
                        'image_id',
                        {
                            $select: ['id'],
                            $from: 'images',
                            $where: {
                                $in: ['product_id', [1, 2]]
                            }
                        }
                    ]
                }
            }

            expect(json_sql).to.deep.equal(goal)
        })
        test('handles nesting under where clause', () => {
            const query = {
                products: {
                    images: {
                        $where: { $gt: ['id', 0] },
                        image_urls: {}
                    }
                }
            }

            const previous_results = [
                [['products'], [{ id: 1 }, { id: 2 }]],
                [['products', 'images'], [{ id: 3 }]]
            ]
            const json_sql = query_to_json_sql(
                query,
                ['products', 'images', 'image_urls'],
                previous_results,
                orma_schema
            )
            const goal = {
                $select: ['image_id'],
                $from: 'image_urls',
                $where: {
                    $in: ['image_id', [3]]
                }
            }

            expect(json_sql).to.deep.equal(goal)
        })
        test("respects 'from' clause", () => {
            const query = {
                my_products: {
                    id: true,
                    $from: 'products'
                }
            }

            const json_sql = query_to_json_sql(query, ['my_products'], [], {})
            const goal = {
                $select: ['id'],
                $from: 'products'
            }

            expect(json_sql).to.deep.equal(goal)
        })
        test.skip("handles 'any' clause", () => {
            const query = {
                $where: {
                    $any: []
                },
                id: true
            }

            const json_sql = query_to_json_sql(query, ['products'], [], {})
            const goal = {}

            expect(json_sql).to.deep.equal(goal)
        })
        test('should not put where or having when not required', () => {
            const query = {
                calls: {
                    id: true
                }
            }
            const orma_schema = {
                calls: {
                    $comment: '',
                    id: {
                        data_type: 'number',
                        required: true,
                        indexed: true,
                        unique: true,
                        primary_key: true,
                        character_count: 10
                    }
                }
            }

            var actual_query = ''
            const test = orma_query(query, orma_schema, sql_strings => {
                actual_query = sql_strings[0]
                return Promise.resolve([])
            })
            expect(actual_query).to.deep.equal('SELECT id FROM calls')
        })
    })
})

/*
THOUGHTS:
what if nothing selected?
what if nothing selected on the root (error?)


// 1. verbose, separates $path into its own key
{
    $any: {
        $eq: {
            $path: [['variants', 'images'], {
                $gt: [1, 2]
            }],
        }
    }
}

SELECT * FROM products WHERE (
    created_at > ANY (
        SELECT created_at FROM variants WHERE product_id = product.id
    )
)

// 2. cant change = or <= behaviour, no separation of $path (what can $path even do on its own? it needs a keyword like 'any', 'in' or 'all')
{
    $any: [['variants', 'images'], {
        $eq: ['id', 3]
    }]
}

// 3. not convention to have $eq as a parameter - usually function names are keys...
{
    $any: [['variants', 'images'], {
        $eq: ['id', 3]
    }, '$eq']
}

// 4. not right either. $eq needs 2 params, since we are setting something is equal to something else.
{
    $eq: {
        $any: [['variants', 'images'], {
            $eq: ['id', 3]
        }]
    }
}

{

}

{
    $eq: ['id', {
        $any: {
            $select: ['product_id'],
            $from: 'variants'
            $where: {
                $eq: ['id', {
                    $any: {
                        $select: ['variant_id']
                        $from: 'images'
                        $where: ...
                    }
                }]
            }
        }
    }]
}

{
    $any: ['id', {
        $select: ['product_id', 'id'],
        $where: {

        }
    }]
}

SELECT column_name(s)
FROM table_name
WHERE column_name operator ANY
  (SELECT column_name
  FROM table_name
  WHERE condition);




operator is one of =, !=, <=, >=...

*/
