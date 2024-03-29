import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../test_data/global_test_schema'
import { PathedRecord } from '../../types'
import { MutationPiece, MutationPlan } from '../plan/mutation_batches'
import {
    get_delete_errors_from_blocking_rows,
    get_delete_verification_query,
    get_mutation_pieces_blocing_delete,
} from './verify_deletes'

type Plan = Pick<MutationPlan, 'mutation_pieces'>

const generate_test_where_in = (
    from_field: string,
    to_entity: string,
    where: any
) => ({
    $in: [
        from_field,
        {
            $select: ['id'],
            $from: to_entity,
            $where: where,
        },
    ],
})

describe('verify_deletes.ts', () => {
    describe(get_delete_verification_query.name, () => {
        test('handles simple deletes', () => {
            const pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'delete',
                        id: 1,
                        $identifying_fields: ['id'],
                    },
                },
                {
                    path: ['users', 1],
                    record: {
                        $operation: 'delete',
                        id: 2,
                        $identifying_fields: ['id'],
                    },
                },
                {
                    path: ['addresses', 0],
                    record: {
                        $operation: 'delete',
                        id: 5,
                        $identifying_fields: ['id'],
                    },
                },
            ]

            const query = get_delete_verification_query(
                global_test_schema,
                new Map(),
                pieces
            )
            expect({ users: query.users, posts: query.posts }).to.deep.equal({
                users: {
                    $select: ['id'],
                    $from: 'users',
                    $where: {
                        $or: [
                            generate_test_where_in(
                                'billing_address_id',
                                'addresses',
                                {
                                    $eq: ['id', { $escape: 5 }],
                                }
                            ),
                            generate_test_where_in(
                                'shipping_address_id',
                                'addresses',
                                {
                                    $eq: ['id', { $escape: 5 }],
                                }
                            ),
                        ],
                    },
                },
                posts: {
                    $select: ['id'],
                    $from: 'posts',
                    $where: generate_test_where_in('user_id', 'users', {
                        $in: ['id', [{ $escape: 1 }, { $escape: 2 }]],
                    }),
                },
            })
        })
        test('handles chained deletes', () => {
            const pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'delete',
                        id: 1,
                        $identifying_fields: ['id'],
                    },
                },
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'delete',
                        id: 11,
                        $identifying_fields: ['id'],
                    },
                },
                {
                    path: ['comments', 0],
                    record: {
                        $operation: 'delete',
                        id: 111,
                        $identifying_fields: ['id'],
                    },
                },
            ]

            const query = get_delete_verification_query(
                global_test_schema,
                new Map(),
                pieces
            )

            expect(Object.keys(query).sort()).to.deep.equal(
                ['comments', 'likes', 'post_has_categories', 'posts'].sort()
            )

            // only check some entities in depth for convenience of the test
            expect({
                posts: query.posts,
                comments: query.comments,
            }).to.deep.equal({
                posts: {
                    $select: ['id'],
                    $from: 'posts',
                    $where: generate_test_where_in('user_id', 'users', {
                        $eq: ['id', { $escape: 1 }],
                    }),
                },
                comments: {
                    $select: ['id'],
                    $from: 'comments',
                    $where: generate_test_where_in('post_id', 'posts', {
                        $eq: ['id', { $escape: 11 }],
                    }),
                },
            })
        })
        test('works with unique keys', () => {
            const pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'delete',
                        email: 'test@test.com',
                        $identifying_fields: ['email'],
                    },
                },
            ]

            const query = get_delete_verification_query(
                global_test_schema,
                new Map(),
                pieces
            )
            expect({ posts: query.posts }).to.deep.equal({
                posts: {
                    $select: ['id'],
                    $from: 'posts',
                    $where: generate_test_where_in('user_id', 'users', {
                        $eq: ['email', { $escape: 'test@test.com' }],
                    }),
                },
            })
        })
        test.skip('selects relevant unique fields')
    })
    describe(get_mutation_pieces_blocing_delete.name, () => {
        test('handles one row', () => {
            const mutation_pieces: MutationPiece[] = []

            const results = {
                users: [
                    {
                        id: 1,
                    },
                ],
            }

            const blocking_pieces = get_mutation_pieces_blocing_delete(
                global_test_schema,
                mutation_pieces,
                new Map(),
                results
            )
            expect(blocking_pieces).to.deep.equal([
                {
                    record: { id: 1 },
                    path: ['users', 0],
                },
            ])
        })
        test('handles multiple rows', () => {
            const mutation_pieces: MutationPiece[] = []

            const results = {
                users: [
                    {
                        id: 1,
                    },
                ],
                posts: [
                    {
                        id: 11,
                    },
                    {
                        id: 12,
                    },
                ],
            }

            const blocking_pieces = get_mutation_pieces_blocing_delete(
                global_test_schema,
                mutation_pieces,
                new Map(),
                results
            )
            expect(blocking_pieces).to.deep.equal([
                {
                    record: { id: 1 },
                    path: ['users', 0],
                },
                {
                    record: { id: 11 },
                    path: ['posts', 0],
                },
                {
                    record: { id: 12 },
                    path: ['posts', 1],
                },
            ])
        })
        test('skips results already deleted in the mutation as deletes', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        id: 2,
                        $operation: 'update',
                        $identifying_fields: ['id'],
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        id: 1,
                        $operation: 'delete',
                        $identifying_fields: ['id'],
                    },
                    path: ['users', 1],
                },
            ]

            const results = {
                users: [
                    {
                        id: 1, // not blocking, since there is a matching delete
                    },
                    {
                        id: 2, // blocking, since there is no matching dlete (only a matching update)
                    },
                ],
            }

            const blocking_pieces = get_mutation_pieces_blocing_delete(
                global_test_schema,
                mutation_pieces,
                new Map(),
                results
            )
            expect(blocking_pieces).to.deep.equal([
                {
                    record: { id: 2 },
                    path: ['users', 0],
                },
            ])
        })
        test('handles deletes by unique field', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        email: 'test@test.com',
                        $operation: 'delete',
                        $identifying_fields: ['email'],
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        id: 2,
                        email: 'best@test.com',
                        $operation: 'delete',
                        $identifying_fields: ['email'],
                    },
                    path: ['users', 1],
                },
            ]

            const results = {
                users: [
                    {
                        id: 1,
                        email: 'test@test.com', // not blocking since this email is in the mutation
                    },
                    {
                        id: 2, // not blocking since this id is in the mutation
                        email: 'best@test.com',
                    },
                ],
            }

            const blocking_pieces = get_mutation_pieces_blocing_delete(
                global_test_schema,
                mutation_pieces,
                new Map(),
                results
            )
            expect(blocking_pieces).to.deep.equal([])
        })
    })
    describe(get_delete_errors_from_blocking_rows.name, () => {
        test('generates errors', () => {
            const blocking_pathed_records: PathedRecord[] = [
                {
                    record: {
                        id: 1,
                    },
                    path: ['users', 0],
                },
            ]
            const errors = get_delete_errors_from_blocking_rows(
                global_test_schema,
                blocking_pathed_records
            )
            expect(errors.length).to.equal(1)
        })
    })
})
