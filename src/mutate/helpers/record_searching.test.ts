import { expect } from 'chai'
import { describe, test } from 'mocha'
import { apply_guid_plan_macro } from '../macros/guid_plan_macro'
import { MutationPiece } from '../plan/mutation_batches'
import { get_identifying_query_for_prefetch } from './record_searching'

describe('record_searching.ts', () => {
    describe(get_identifying_query_for_prefetch.name, () => {
        test('creates a query for one mutation piece', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        email: 'a@b.com',
                        $identifying_fields: ['id'],
                    },
                    path: ['users', 0],
                },
            ]

            const result = get_identifying_query_for_prefetch(
                new Map(),
                mutation_pieces,
                [0],
                'users',
                _ => ['id'],
                mutation_piece => [mutation_piece.record.$identifying_fields]
            )

            expect(result).to.deep.equal({
                id: true,
                $from: 'users',
                $where: {
                    $eq: [{ $entity: 'users', $field: 'id' }, { $escape: 1 }],
                },
            })
        })
        test('creates a query for multiple $guid entities', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 'user0' },
                        email: 'a@b.com',
                        $identifying_fields: ['email'],
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 'post0' },
                        title: 'test post 0',
                        $identifying_fields: ['title'],
                    },
                    path: ['posts', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 'post1' },
                        title: 'test post 1',
                        $identifying_fields: ['title'],
                    },
                    path: ['posts', 1],
                },
                {
                    record: {
                        $operation: 'update',
                        user_id: { $guid: 'user0' },
                        post_id: { $guid: 'post0' },
                        $identifying_fields: ['user_id', 'post_id'],
                    },
                    path: ['likes', 0],
                },
                {
                    // this like links to the same user, but different post as the previous one
                    record: {
                        $operation: 'update',
                        user_id: { $guid: 'user0' },
                        post_id: { $guid: 'post1' },
                        $identifying_fields: ['user_id', 'post_id'],
                    },
                    path: ['likes', 1],
                },
            ]

            const guid_map = apply_guid_plan_macro(mutation_pieces, [
                { start_index: 0, end_index: 3 },
                { start_index: 3, end_index: 5 },
            ])

            const result = get_identifying_query_for_prefetch(
                guid_map,
                mutation_pieces,
                [3, 4],
                'likes',
                _ => ['id', 'user_id'],
                mutation_piece => [mutation_piece.record.$identifying_fields]
            )

            expect(result).to.deep.equal({
                id: true,
                user_id: true,
                $from: 'likes',
                $where: {
                    $or: [
                        {
                            $and: [
                                {
                                    $eq: [
                                        { $entity: 'users', $field: 'email' },
                                        { $escape: 'a@b.com' },
                                    ],
                                },
                                {
                                    $eq: [
                                        { $entity: 'posts', $field: 'title' },
                                        { $escape: 'test post 0' },
                                    ],
                                },
                            ],
                        },
                        {
                            $and: [
                                {
                                    $eq: [
                                        { $entity: 'users', $field: 'email' },
                                        { $escape: 'a@b.com' },
                                    ],
                                },
                                {
                                    $eq: [
                                        { $entity: 'posts', $field: 'title' },
                                        { $escape: 'test post 1' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
                $inner_join: [
                    {
                        $entity: 'users',
                        $on: {
                            $eq: [
                                { $entity: 'likes', $field: 'user_id' },
                                { $entity: 'users', $field: 'id' },
                            ],
                        },
                    },
                    {
                        $entity: 'posts',
                        $on: {
                            $eq: [
                                { $entity: 'likes', $field: 'post_id' },
                                { $entity: 'posts', $field: 'id' },
                            ],
                        },
                    },
                ],
            })
        })
        test('handles guid linking to record with multiple identifying fields', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 'user0' },
                        first_name: 'John',
                        last_name: 'Ny',
                        $identifying_fields: ['first_name', 'last_name'],
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        user_id: { $guid: 'user0' },
                        post_id: 1,
                        $identifying_fields: ['user_id', 'post_id'],
                    },
                    path: ['likes', 0],
                },
            ]

            const guid_map = apply_guid_plan_macro(mutation_pieces, [
                { start_index: 0, end_index: 1 },
                { start_index: 1, end_index: 2 },
            ])

            const result = get_identifying_query_for_prefetch(
                guid_map,
                mutation_pieces,
                [1],
                'likes',
                _ => ['id'],
                mutation_piece => [mutation_piece.record.$identifying_fields]
            )

            expect(result).to.deep.equal({
                id: true,
                $from: 'likes',
                $where: {
                    $and: [
                        {
                            $eq: [
                                { $entity: 'users', $field: 'first_name' },
                                { $escape: 'John' },
                            ],
                        },
                        {
                            $eq: [
                                { $entity: 'users', $field: 'last_name' },
                                { $escape: 'Ny' },
                            ],
                        },
                        {
                            $eq: [
                                { $entity: 'likes', $field: 'post_id' },
                                { $escape: 1 },
                            ],
                        },
                    ],
                },
                $inner_join: [
                    {
                        $entity: 'users',
                        $on: {
                            $eq: [
                                { $entity: 'likes', $field: 'user_id' },
                                { $entity: 'users', $field: 'id' },
                            ],
                        },
                    },
                ],
            })
        })
    })
})
