import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../test_data/global_test_schema'
import { validate_query } from './query_validation'

describe('query_validation.ts', () => {
    describe(validate_query.name, () => {
        test('requires valid $from', () => {
            const errors = validate_query(
                {
                    posts: {
                        $from: 'not_an_entity',
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts', '$from']])
        })
        test('requires valid simple field names', () => {
            const errors = validate_query(
                {
                    posts: {
                        not_a_field: true,
                        $from: 'posts',
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts', 'not_a_field']])
        })
        test('requires valid renamed field names', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: 'not_a_field',
                        $from: 'posts',
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts', 'id']])
        })
        test('allows order by', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $order_by: [
                            {
                                $desc: 'title',
                            },
                            {
                                $asc: {
                                    $sum: 'id',
                                },
                            },
                        ],
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires valid order by expression', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $order_by: [
                            {
                                $desc: 'not_a_field',
                            },
                        ],
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts', '$order_by', 0, '$desc']])
        })
        test('allows order by to referenced aliased fields', () => {
            const errors = validate_query(
                {
                    posts: {
                        $select: [{ $as: ['id', 'my_id2'] }],
                        my_id: 'id',
                        $from: 'posts',
                        $order_by: [
                            { $asc: { $sum: 'my_id' } },
                            { $desc: 'my_id2' },
                        ],
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows group by', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $group_by: [
                            {
                                $sum: 'id',
                            },
                        ],
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires group by has valid fields', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $group_by: ['not_a_field'],
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts', '$group_by', 0]])
        })
        test('doesnt allow special characters in field alias', () => {
            const errors = validate_query(
                {
                    posts: {
                        $select: [{ $as: ['id', "i'd"] }],
                        "my_'id": 'id',
                        $from: 'posts',
                        $group_by: ['my_id'],
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts'], ['posts', '$select', 0]])
        })
        test('allows group by to referenced aliased fields', () => {
            const errors = validate_query(
                {
                    posts: {
                        $select: [
                            {
                                $as: ['id', 'my_id2'],
                            },
                        ],
                        my_id: 'id',
                        $from: 'posts',
                        $group_by: ['my_id', 'my_id2'],
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows select to reference other select fields', () => {
            const errors = validate_query(
                {
                    posts: {
                        $select: [
                            {
                                $as: ['id', 'my_id2'],
                            },
                            {
                                $as: ['my_id2', 'my_id3'],
                            },
                        ],
                        my_id: 'id',
                        $from: 'posts',
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows limit and offset', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $limit: 1,
                        $offset: 1,
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires positive limit and offset', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $limit: -1,
                        $offset: -1,
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['posts', '$limit'],
                ['posts', '$offset'],
            ])
        })
        test('allows where clause $and', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $where: {
                            $and: [
                                {
                                    $eq: ['id', 'id'],
                                },
                            ],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows where clause operations', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
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
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test("$eq can't have an empty object", () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $where: {
                            $eq: ['id', {}],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts', '$where']])
        })
        test('requires valid expression in operation', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $where: {
                            $eq: ['not_a_field', 'test'], // the value must be escaped or a field name
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['posts', '$where', '$eq', 0],
                ['posts', '$where', '$eq', 1],
            ])
        })
        test('allows where clause $in with list of values', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $where: {
                            $in: ['id', [{ $escape: 1 }, { $escape: '2' }]],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows escape on outside of $in values', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $where: {
                            $in: ['id', { $escape: [1, 2] }],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires an array for $in', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $where: {
                            $in: ['id', { $escape: true }],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts', '$where']])
        })
        test('allows where clause $in with subquery', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $where: {
                            $in: [
                                'user_id',
                                {
                                    $select: ['id'],
                                    $from: 'users',
                                },
                            ],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires valid select in $in subquery', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $from: 'posts',
                        $where: {
                            $in: [
                                'user_id',
                                {
                                    $select: ['not_a_field'],
                                    $from: 'users',
                                },
                            ],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['posts', '$where', '$in', 1, '$select', 0],
            ])
        })
        test('allows aliased fields in $having', () => {
            const errors = validate_query(
                {
                    posts: {
                        my_id: 'id',
                        $from: 'posts',
                        $having: {
                            $eq: ['my_id', { $escape: 12 }],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires $any_path have connected entities', () => {
            const errors = validate_query(
                {
                    users: {
                        id: true,
                        $from: 'users',
                        $where: {
                            $any_path: [
                                ['comments'],
                                {
                                    $eq: [
                                        'post_id',
                                        {
                                            $escape: 12,
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['users', '$where', '$any_path', 0, 0],
            ])
        })
        test('correctly interprets which entity the $any_path is on', () => {
            const errors = validate_query(
                {
                    users: {
                        id: true,
                        $from: 'users',
                        $where: {
                            $any_path: [
                                ['posts', 'comments'],
                                {
                                    // user_id is on posts, not comments, so this is an error
                                    $eq: [
                                        'user_id',
                                        {
                                            $escape: 12,
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['users', '$where', '$any_path', 1, '$eq', 0],
            ])
        })
        test('allows $where_connected', () => {
            const errors = validate_query(
                {
                    $where_connected: [
                        {
                            $entity: 'users',
                            $field: 'id',
                            $values: [1, 'a'],
                        },
                    ],
                    posts: {
                        id: true,
                        $from: 'posts',
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('$where_connected must have values', () => {
            const errors = validate_query(
                {
                    $where_connected: [
                        {
                            $entity: 'users',
                            $field: 'id',
                            $values: [], // this cant be empty
                        },
                    ],
                    posts: {
                        id: true,
                    },
                },
                global_test_schema
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
                    posts: {
                        id: true,
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['$where_connected', 0, '$entity']])
        })
        test('$where_connected must not have duplicates', () => {
            const errors = validate_query(
                {
                    $where_connected: [
                        {
                            $entity: 'users',
                            $field: 'id',
                            $values: [1],
                        },
                        {
                            // vendors.id appears twice
                            $entity: 'users',
                            $field: 'id',
                            $values: [2],
                        },
                    ],
                    posts: {
                        id: true,
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['$where_connected', 1]])
        })
        test('allows $distinct in aggregate functions', () => {
            const errors = validate_query(
                {
                    posts: {
                        max_id: {
                            $max: {
                                $distinct: 'id',
                            },
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows $count *', () => {
            const errors = validate_query(
                {
                    posts: {
                        count: {
                            $count: '*',
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('allows $select *', () => {
            const errors = validate_query(
                {
                    posts: {
                        id: true,
                        $select: ['*'],
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requies at least one $or', () => {
            const errors = validate_query(
                {
                    posts: {
                        $where: { $or: [] },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts', '$where']])
        })
        test('requires at least one $and', () => {
            const errors = validate_query(
                {
                    posts: {
                        $where: { $and: [] },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts', '$where']])
        })
        test('allows valid $entity $field', () => {
            const errors = validate_query(
                {
                    posts: {
                        $where: {
                            $eq: [
                                { $entity: 'posts', $field: 'id' },
                                { $escape: 1 },
                            ],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('requires valid $entity name', () => {
            const errors = validate_query(
                {
                    posts: {
                        $where: {
                            $eq: [
                                {
                                    $entity: 'not_an_entity',
                                    $field: 'user_id',
                                },
                                { $escape: 1 },
                            ],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['posts', '$where', '$eq', 0, '$entity'],
            ])
        })
        test('requires valid $field name', () => {
            const errors = validate_query(
                {
                    posts: {
                        $where: {
                            $eq: [
                                { $entity: 'posts', $field: 'post_id' },
                                { $escape: 1 },
                            ],
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['posts', '$where', '$eq', 0, '$field'],
            ])
        })
        test.skip('must have a data prop if there is no valid sql function', () => {
            // not necessary, but could make user experience better. Add this to js validation when there is time
            const errors = validate_query(
                {
                    posts: {
                        $limit: 1, // limit is not an sql function, so there neeeds to be a prop e.g. id: true
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([['posts']])
        })
        test('allows $foreign_key', () => {
            const errors = validate_query(
                {
                    posts: {
                        comments: {
                            id: true,
                            $foreign_key: ['post_id'], // regular nest
                            posts: {
                                id: true,
                                $foreign_key: ['post_id'], // reverse nest
                            },
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([])
        })
        test('$foreign_key must be valid', () => {
            const errors = validate_query(
                {
                    posts: {
                        $foreign_key: ['post_id'], // wrong level, should be on images
                        comments: {
                            id: true,
                            $foreign_key: ['user_id'], // wrong field, vendor_id doesnt connect images and products
                        },
                        users: {
                            id: true,
                            $foreign_key: ['id', 'id'], // two fields are invalid
                        },
                    },
                },
                global_test_schema
            )

            const paths = errors?.map(el => el?.path)
            expect(paths).to.deep.equal([
                ['posts', 'comments', '$foreign_key', 0],
                ['posts', 'users', '$foreign_key'],
                ['posts', '$foreign_key', 0],
            ])
        })
    })
})
