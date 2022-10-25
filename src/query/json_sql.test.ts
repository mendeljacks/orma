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
            const goal = format('WHERE a = b')

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
    })
})
