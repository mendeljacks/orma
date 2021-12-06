import { expect } from 'chai'
import { describe, test } from 'mocha'
import {
    combine_wheres,
    get_search_records_where,
    is_subquery,
    query_for_each,
} from './query_helpers'

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
                $and: [
                    { $eq: ['id', 1] },
                    { $eq: ['id', 2] },
                    { $eq: ['id', 3] },
                    { $eq: ['id', 4] },
                ],
            })
        })
        test('works for no initial connetive but added connective', () => {
            const wheres = [
                { $eq: ['id', 1] },
                { $and: [{ $eq: ['id', 2] }, { $eq: ['id', 3] }] },
            ]
            const result = combine_wheres(wheres, '$and')
            expect(result).to.deep.equal({
                $and: [
                    { $eq: ['id', 1] },
                    { $eq: ['id', 2] },
                    { $eq: ['id', 3] },
                ],
            })
        })
    })
    describe(get_search_records_where.name, () => {
        test('handles single field', () => {
            const records = [
                {
                    field1: 'hi',
                    field2: 'hi2',
                },
            ]

            const result = get_search_records_where(
                records,
                record => ['field1'],
                el => el
            )

            expect(result).to.deep.equal({
                $in: ['field1', ['hi']],
            })
        })
        test('handles escaping', () => {
            const records = [
                {
                    field1: 'hi',
                },
            ]

            const result = get_search_records_where(
                records,
                record => ['field1'],
                el => `"${el}"`
            )

            expect(result).to.deep.equal({
                $in: ['field1', ['"hi"']],
            })
        })
        test('handles multiple fields', () => {
            const records = [
                {
                    field1: 'hi',
                    field2: 'hi2',
                    field3: 'hi3',
                },
            ]

            const result = get_search_records_where(
                records,
                record => ['field1', 'field2'],
                el => el
            )

            expect(result).to.deep.equal({
                $and: [
                    {
                        $eq: ['field1', 'hi'],
                    },
                    {
                        $eq: ['field2', 'hi2'],
                    },
                ],
            })
        })
        test('handles multiple records', () => {
            const records = [
                {
                    type: 1,
                    field1: 'a',
                },
                {
                    type: 1,
                    field1: 'b',
                },
                {
                    type: 2,
                    field1: 'c1',
                    field2: 'c2',
                },
                {
                    type: 2,
                    field1: 'd1',
                    field2: 'd2',
                },
            ]

            const result = get_search_records_where(
                records,
                record =>
                    record.type === 1 ? ['field1'] : ['field1', 'field2'],
                el => el
            )

            expect(result).to.deep.equal({
                $or: [
                    {
                        $in: ['field1', ['a', 'b']],
                    },
                    {
                        $and: [
                            {
                                $eq: ['field1', 'c1'],
                            },
                            {
                                $eq: ['field2', 'c2'],
                            },
                        ],
                    },
                    {
                        $and: [
                            {
                                $eq: ['field1', 'd1'],
                            },
                            {
                                $eq: ['field2', 'd2'],
                            },
                        ],
                    },
                ],
            })
        })
    })
})
