import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../../test_data/global_test_schema'
import { apply_guid_plan_macro } from '../../macros/guid_plan_macro'
import { MutationPiece } from '../../plan/mutation_plan'
import { get_guid_query } from '../mutation_guid_query'

describe('mutation_guid_query.ts', () => {
    describe(get_guid_query.name, () => {
        test('generates a giud query', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'a' },
                        email: 'a@a.com',
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 1 },
                        first_name: 'john',
                        last_name: 'smith',
                        $identifying_fields: ['first_name', 'last_name'],
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        $operation: 'delete',
                        id: 1,
                        $identifying_fields: ['id'],
                    },
                    path: ['users', 1],
                },
            ]

            const guid_map = apply_guid_plan_macro(mutation_pieces, [
                { start_index: 0, end_index: 3 },
            ])

            const result = get_guid_query(
                mutation_pieces,
                [0, 1, 2],
                'users',
                guid_map,
                global_test_schema
            )

            expect(result).to.deep.equal({
                $select: ['id', 'email', 'first_name', 'last_name'],
                $from: 'users',
                $where: {
                    $or: [
                        {
                            $eq: ['email', "'a@a.com'"],
                        },
                        {
                            $and: [
                                {
                                    $eq: ['first_name', "'john'"],
                                },
                                {
                                    $eq: ['last_name', "'smith'"],
                                },
                            ],
                        },
                        {
                            $eq: ['id', 1],
                        },
                    ],
                },
            })
        })
        test('handles empty query', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: 1,
                    },
                    path: ['users', 0],
                },
            ]

            const result = get_guid_query(
                mutation_pieces,
                [0],
                'users',
                new Map(),
                global_test_schema
            )

            expect(result).to.deep.equal(undefined)
        })
    })
})
