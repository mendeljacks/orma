import { expect } from 'chai'
import { validate } from 'jsonschema'
import { describe, test } from 'mocha'
import { as_orma_schema } from '../query'
import { validate_query } from './query_validation'

describe('query_validation.ts', () => {
    const orma_schema = as_orma_schema({
        products: {
            id: {
                data_type: 'int',
            },
            vendor_id: {
                data_type: 'int',
                references: {
                    vendors: {
                        id: {},
                    },
                },
            },
            name: {
                data_type: 'varchar',
            },
            description: {
                data_type: 'varchar',
            },
            $indexes: [],
        },
        vendors: {
            id: {},
        },
        images: {
            id: {},
            product_id: {
                references: {
                    products: {
                        id: {},
                    },
                },
            },
        },
        image_urls: {
            image_id: {
                references: {
                    images: {
                        id: {},
                    },
                },
            },
        },
    } as const)

    describe(validate_query.name, () => {
        test('requires valid $from', () => {
            const errors = validate_query(
                {
                    products: {
                        $from: 'not_an_entity',
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['products', '$from']])
        })
        test('requires valid simple field names', () => {
            const errors = validate_query(
                {
                    products: {
                        not_a_field: true,
                        $from: 'products',
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['products', 'not_a_field']])
        })
        test('requires valid renamed field names', () => {
            const errors = validate_query(
                {
                    products: {
                        id: 'not_a_field',
                        $from: 'products',
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['products', 'id']])
        })
        test('allows order by', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $order_by: [
                            {
                                $desc: 'name',
                            },
                            {
                                $asc: {
                                    $sum: 'id',
                                },
                            },
                        ],
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires valid order by expression', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $order_by: [
                            {
                                $desc: 'not_a_field',
                            },
                        ],
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['products', '$order_by', 0, '$desc']])
        })
        test('allows order by to referenced aliased fields', () => {
            const errors = validate_query(
                {
                    products: {
                        my_id: 'id',
                        $from: 'products',
                        $order_by: [{ $asc: { $sum: 'my_id' } }],
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows group by', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $group_by: [
                            {
                                $sum: 'id',
                            },
                        ],
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires group by has valid fields', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $group_by: ['not_a_field'],
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['products', '$group_by', 0]])
        })
        test('allows group by to referenced aliased fields', () => {
            const errors = validate_query(
                {
                    products: {
                        my_id: 'id',
                        $from: 'products',
                        $group_by: ['my_id'],
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows limit and offset', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $limit: 1,
                        $offset: 1,
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires positive limit and offset', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $limit: -1,
                        $offset: -1,
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['products', '$limit'],
                ['products', '$offset'],
            ])
        })
        test('allows where clause $and', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $where: {
                            $and: [
                                {
                                    $eq: ['id', 'id'],
                                },
                            ],
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows where clause operations', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $where: {
                            $and: [
                                {
                                    $eq: ['id', { $escape: '123' }],
                                },
                                {
                                    $gt: ['id', 'id'],
                                },
                                {
                                    $lt: ['id', 'id'],
                                },
                                {
                                    $gte: ['id', 'id'],
                                },
                                {
                                    $lte: ['id', 'id'],
                                },
                                {
                                    $like: ['id', 'id'],
                                },
                            ],
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires valid expression in operation', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $where: {
                            $eq: ['not_a_field', 'test'], // the value must be escaped or a field name
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['products', '$where', '$eq', 0],
                ['products', '$where', '$eq', 1],
            ])
        })
        test('allows where clause $in with list of values', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $where: {
                            $in: ['id', [{ $escape: 1 }, { $escape: '2' }]],
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows escape on outside of $in values', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $where: {
                            $in: ['id', { $escape: [1, 2] }],
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires an array for $in', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $where: {
                            $in: ['id', { $escape: true }],
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['products', '$where']])
        })
        test('allows where clause $in with subquery', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $where: {
                            $in: [
                                'vendor_id',
                                {
                                    $select: ['id'],
                                    $from: 'vendors',
                                },
                            ],
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires valid select in $in subquery', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $where: {
                            $in: [
                                'vendor_id',
                                {
                                    $select: ['not_a_field'],
                                    $from: 'vendors',
                                },
                            ],
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['products', '$where', '$in', 1, '$select', 0],
            ])
        })
        test('allows aliased fields in $having', () => {
            const errors = validate_query(
                {
                    products: {
                        my_id: 'id',
                        $from: 'products',
                        $having: {
                            $eq: ['my_id', { $escape: 12 }],
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires $any_path have connected entities', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $where: {
                            $any_path: [
                                ['image_urls'],
                                {
                                    $eq: [
                                        'image_id',
                                        {
                                            $escape: 12,
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['products', '$where', '$any_path', 0, 0],
            ])
        })
        test('correctly interprets which entity the $any_path is on', () => {
            const errors = validate_query(
                {
                    products: {
                        id: true,
                        $from: 'products',
                        $where: {
                            $any_path: [
                                ['images', 'image_urls'],
                                {
                                    // vendor_id is on the products, not image_urls, so this is an error
                                    $eq: [
                                        'vendor_id',
                                        {
                                            $escape: 12,
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['products', '$where', '$any_path', 1, '$eq', 0],
            ])
        })
        test('allows $where_connected', () => {
            const errors = validate_query(
                {
                    $where_connected: [
                        {
                            $entity: 'vendors',
                            $field: 'id',
                            $values: [1, 'a'],
                        },
                    ],
                    products: {
                        id: true,
                        $from: 'products',
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('$where_connected must have values', () => {
            const errors = validate_query(
                {
                    $where_connected: [
                        {
                            $entity: 'vendors',
                            $field: 'id',
                            $values: [], // this cant be empty
                        },
                    ],
                    products: {
                        id: true,
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['$where_connected', 0, '$values']])
        })
        test('$where_connected must have valid entity names', () => {
            const errors = validate_query(
                {
                    $where_connected: [
                        {
                            $entity: 'not_an_entity',
                            $field: 'id',
                            $values: [1],
                        },
                    ],
                    products: {
                        id: true,
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['$where_connected', 0, '$entity']])
        })
        test('$where_connected must not have duplicates', () => {
            const errors = validate_query(
                {
                    $where_connected: [
                        {
                            $entity: 'vendors',
                            $field: 'id',
                            $values: [1],
                        },
                        {
                            // vendors.id appears twice
                            $entity: 'vendors',
                            $field: 'id',
                            $values: [2],
                        },
                    ],
                    products: {
                        id: true,
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['$where_connected', 1]])
        })
        test('allows $distinct in aggregate functions', () => {
            const errors = validate_query(
                {
                    products: {
                        max_id: {
                            $max: {
                                $distinct: 'id',
                            },
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows $count *', () => {
            const errors = validate_query(
                {
                    products: {
                        count: {
                            $count: '*',
                        },
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requies at least one $or', () => {
            const errors = validate_query(
                {
                    products: {
                        $where: { $or: []}
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['products', '$where']])
        })
        test('requies at least one $and', () => {
            const errors = validate_query(
                {
                    products: {
                        $where: { $and: []}
                    },
                },
                orma_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['products', '$where']])
        })
    })
})
