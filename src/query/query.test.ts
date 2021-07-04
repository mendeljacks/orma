import { expect } from 'chai'
import { describe, test } from 'mocha'
import { format } from 'sql-formatter'
import { orma_schema } from '../introspector/introspector'
import { get_subquery_sql, json_to_sql } from './query'


describe('query', () => {
    describe('json_to_sql', () => {
        test('joins commands', () => {
            const json =  {
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
        test('\'not\' command works', () => {
            const json = {
                $not: {
                    $in: ['a', [1, 2]]
                }
            }

            const sql = format(json_to_sql(json))
            const goal = format('a NOT IN (1, 2)')

            expect(sql).to.equal(goal)
        })
    })
    describe('get_query_plan', () => {
        test('creates query plan', () => {
            const query = {
                products: {
                    variants: {
                        $where: {},
                        vins: {},
                        images: {
                            images_in_stores: {}
                        }
                    }
                }
            }
    
            // the split happens at variants because it has a where clause
            const goal = [
                [['products'], ['products', 'variants']], // first these are run concurrently
                [['products', 'variants', 'images'], ['products', 'variants', 'images', 'images_in_stores']] // then these are run concurrently
            ]
        })
    })
    describe('get_subquery_sql', () => {
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

            const sql = get_subquery_sql(query, ['products'], [])
            const goal = format('SELECT id, title AS my_title, SUM(quantity) AS total_quantity')
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

            // const orma_schema: orma_schema = {
            //     entities: {
            //         products: {
            //             fields:
            //         }
            //     }
            // }

            const previous_results = [['products'], {}]
            const sql = get_subquery_sql(query, ['products', 'images'], [])
        })
    })
})



/*
THOUGHTS:
what if nothing selected?
what if nothing selected on the root (error?)
*/