import { expect } from 'chai'
import { describe, test } from 'mocha'
import { format } from 'sql-formatter'
import { json_to_sql } from './json_sql'

describe('query', () => {
    describe('json_to_sql', () => {
        test('joins commands', () => {
            const json = {
                $select: ['a'],
                $from: 'b',
            }

            const sql = format(json_to_sql(json))
            const goal = format(`SELECT a FROM b`)

            expect(sql).to.equal(goal)
        })
        test('nested command work', () => {
            const json = {
                $where: {
                    $eq: ['a', 'b'],
                },
            }

            const sql = format(json_to_sql(json))
            const goal = format('WHERE (a) = (b)')

            expect(sql).to.equal(goal)
        })
        test("'$not' command works", () => {
            const json = {
                $not: {
                    $in: ['a', [1, 2]],
                },
            }

            const sql = format(json_to_sql(json))
            const goal = format('a NOT IN (1, 2)')

            expect(sql).to.equal(goal)
        })
        test('$not works with null equality', () => {
            const json = {
                $and: [
                    {
                        $not: {
                            $eq: ['a', null],
                        },
                    },
                    {
                        $not: {
                            // this also evualuates to NULL when passed into sql. Sql commands are case insensitive, so
                            // the casing shouldnt matter
                            $eq: ['a', 'NuLl'],
                        },
                    },
                ],
            }

            const sql = format(json_to_sql(json))
            const goal = format('((a) IS NOT NULL) AND ((a) IS NOT NULL)')

            expect(sql).to.equal(goal)
        })
        test('handles aggregate functions', () => {
            const json = {
                $min: 'field',
                $count: '*',
            }

            const sql = format(json_to_sql(json))
            const goal = format('MIN(field) COUNT(*)')

            expect(sql).to.equal(goal)
        })
        test('handles functions with multiple args', () => {
            const json = {
                $coalesce: [1, 2],
            }

            const sql = format(json_to_sql(json))
            const goal = format('COALESCE(1, 2)')

            expect(sql).to.equal(goal)
        })
        test('$round', () => {
            const json = {
                $round: [1.234, 2],
            }

            const sql = format(json_to_sql(json))
            const goal = format('ROUND(1.234, 2)')

            expect(sql).to.equal(goal)
        })
        test('handles upper', () => {
            const json = { $upper: "'hello'" }
            const sql = format(json_to_sql(json))
            const goal = format(`UPPER('hello')`)
            expect(sql).to.equal(goal)
        })
        test('handles lower', () => {
            const json = { $lower: "'hello'" }
            const sql = format(json_to_sql(json))
            const goal = format(`LOWER('hello')`)
            expect(sql).to.equal(goal)
        })
        test('handles if', () => {
            const json = {
                $if: [{ $eq: [1, 1] }, 'yes', 'no'],
            }
            const sql = format(json_to_sql(json))
            const goal = format(`if('1=1', 'yes', 'no')`)
            expect(sql).to.equal(goal)
        })
        test('handles concat', () => {
            const json = { $concat: [{ $escape: 'a' }, { $escape: 'b' }] }
            const sql = format(json_to_sql(json))
            const goal = format(`CONCAT('a', 'b')`)
            expect(sql).to.equal(goal)
        })

        test("ignores even number of '$not' commands", () => {
            const json = {
                $not: {
                    $not: {
                        $not: {
                            $not: {
                                $in: ['a', [1, 2]],
                            },
                        },
                    },
                },
            }

            const sql = format(json_to_sql(json))
            const goal = format('a IN (1, 2)')

            expect(sql).to.equal(goal)
        })
        test('ignores undefined properties', () => {
            const json = {
                $having: undefined,
            }
            //@ts-ignore
            const sql = format(json_to_sql(json))
            const goal = format('')

            expect(sql).to.equal(goal)
        })
        test('handles $entity $field', () => {
            const json = {
                $entity: 'items',
                $field: 'sku',
            }
            //@ts-ignore
            const sql = format(json_to_sql(json))
            const goal = format('items.sku')

            expect(sql).to.equal(goal)
        })
        test('Can wrap subqueries in ()', () => {
            const json = {
                $having: {
                    $gte: [
                        {
                            $select: ['*'],
                            $from: 'reviews',
                            $where: { $eq: ['listing_id', 0] },
                        },
                        4,
                    ],
                },
            }

            const sql = format(json_to_sql(json))

            const goal = format(`
            HAVING
            (SELECT
              *
            FROM
              reviews
            WHERE
              (listing_id) = (0)) >= (4)`)

            expect(sql).to.equal(goal)
        })
    })
})
