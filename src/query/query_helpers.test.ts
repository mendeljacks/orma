import { expect } from 'chai'
import { describe, test } from 'mocha'
import { combine_wheres, is_subquery, query_for_each } from './query_helpers'

describe('query helpers', () => {
    describe(is_subquery.name, () => {
        test('is subquery', () => {
            const result = is_subquery({
                $from: 'products',
                id: {},
            })

            expect(result).to.equal(true)
        })
        test('not subquery', () => {
            const result = is_subquery({
                $from: 'products',
            })

            expect(result).to.equal(false)
        })
    })
    describe(query_for_each.name, () => {
        test('maps over a query', () => {
            const query = {
                root1: {
                    child: {},
                    $keyword: {},
                },
                root2: {},
            }

            const results = []
            query_for_each(query, (value, path) => {
                results.push([value, path])
            })

            expect(results).to.deep.equal([
                [{ child: {}, $keyword: {} }, ['root1']],
                [{}, ['root2']],
                [{}, ['root1', 'child']],
            ])
        })
    })
    describe(combine_wheres.name, () => {
        test('returns undefined for no wheres', () => {
            const wheres = []
            const result = combine_wheres(wheres, '$and')
            expect(result).to.equal(undefined)
        })
        test('works for 1 where', () => {
            const wheres = [{ $eq: ['id', 1] }]
            const result = combine_wheres(wheres, '$and')
            expect(result).to.deep.equal({ $eq: ['id', 1] })
        })
        test('works for multiple wheres without connective', () => {
            const wheres = [{ $eq: ['id', 1] }, { $eq: ['id', 2] }]
            const result = combine_wheres(wheres, '$and')
            expect(result).to.deep.equal({
                $and: [{ $eq: ['id', 1] }, { $eq: ['id', 2] }],
            })
        })
        test('works for multiple wheres with connective', () => {
            const wheres = [
                { $and: [{ $eq: ['id', 1] }, { $eq: ['id', 2] }] },
                { $and: [{ $eq: ['id', 3] }, { $eq: ['id', 4] }] },
            ]
            const result = combine_wheres(wheres, '$and')
            expect(result).to.deep.equal({
                $and: [{ $eq: ['id', 1] }, { $eq: ['id', 2] }, { $eq: ['id', 3] }, { $eq: ['id', 4] }],
            })
        })
        test('works for no initial connetive but added connective', () => {
            const wheres = [
                { $eq: ['id', 1] },
                { $and: [{ $eq: ['id', 2] }, { $eq: ['id', 3] }] },
            ]
            const result = combine_wheres(wheres, '$and')
            expect(result).to.deep.equal({
                $and: [{ $eq: ['id', 1] }, { $eq: ['id', 2] }, { $eq: ['id', 3] }],
            })
        })
    })
})
