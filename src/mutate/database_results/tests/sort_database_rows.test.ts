import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../../test_data/global_test_schema'
import { apply_guid_plan_macro } from '../../macros/guid_plan_macro'
import { MutationBatch, MutationPiece } from '../../plan/mutation_batches'
import { sort_database_rows } from '../sort_database_rows'

describe('guid_processing.ts', () => {
    describe(sort_database_rows.name, () => {
        test('throws if not enough mysql results', () => {
            try {
                sort_database_rows(
                    [],
                    new Map(),
                    { start_index: 0, end_index: 0 },
                    [],
                    [],
                    global_test_schema
                )
                expect('should throw an error').to.equal(true)
            } catch (error) {}
        })
        test('sorts mutation pieces', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'a' },
                        label: 'my product 1',
                    },
                    path: ['categories', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 'b' },
                        label: 'my product 2',
                    },
                    path: ['categories', 1],
                },
            ]
            const query_results = [
                [
                    {
                        id: 2,
                        label: 'my product 2',
                    },
                    {
                        id: 1,
                        label: 'my product 1',
                    },
                ],
            ]

            const guid_map = apply_guid_plan_macro(mutation_pieces, [
                { start_index: 0, end_index: 2 },
            ])

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                guid_map,
                { start_index: 0, end_index: 2 },
                ['categories'],
                query_results,
                global_test_schema
            )

            expect(sorted_database_rows).to.deep.equal([
                {
                    id: 1,
                    label: 'my product 1',
                },
                {
                    id: 2,
                    label: 'my product 2',
                },
            ])
        })
        test('sorts rows from multiple queries', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'a' },
                        label: 'my product 1',
                    },
                    path: ['categories', 0],
                },
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'b' },
                        email: 'a',
                    },
                    path: ['users', 0],
                },
            ]
            const query_results = [
                [
                    {
                        id: 11,
                        label: 'my product 1',
                    },
                ],
                [
                    {
                        id: 22,
                        email: 'a',
                    },
                ],
            ]

            const guid_map = apply_guid_plan_macro(mutation_pieces, [
                { start_index: 0, end_index: 2 },
            ])

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                guid_map,
                { start_index: 0, end_index: 2 },
                ['categories', 'users'],
                query_results,
                global_test_schema
            )

            expect(sorted_database_rows).to.deep.equal([
                {
                    id: 11,
                    label: 'my product 1',
                },
                {
                    id: 22,
                    email: 'a',
                },
            ])
        })
        test('handles compound primary key', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        first_name: 'john',
                        last_name: 'smith',
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        first_name: 'john',
                        last_name: 'doe',
                    },
                    path: ['users', 1],
                },
            ]
            const query_results = [
                [
                    {
                        first_name: 'john',
                        last_name: 'doe',
                        age: 20,
                    },
                    {
                        first_name: 'john',
                        last_name: 'smith',
                        age: 21,
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                new Map(),
                { start_index: 0, end_index: 2 },
                ['users'],
                query_results,
                global_test_schema
            )

            expect(sorted_database_rows).to.deep.equal([
                {
                    first_name: 'john',
                    last_name: 'smith',
                    age: 21,
                },
                {
                    first_name: 'john',
                    last_name: 'doe',
                    age: 20,
                },
            ])
        })
        test('handles duplicate rows', () => {
            // this situation could happen e.g. if there are rows in different locations in the mutation
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        line_1: 'test 1',
                    },
                    path: ['addresses', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        line_1: 'test 2',
                    },
                    path: ['addresses', 1],
                },
            ]
            const query_results = [
                [
                    {
                        id: 1,
                        created_at: 'now',
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                new Map(),
                { start_index: 0, end_index: 2 },
                ['addresses'],
                query_results,
                global_test_schema
            )

            // the single database row is matched to both mutation pieces, since the two mutation pieces
            // have the same id
            expect(sorted_database_rows).to.deep.equal([
                {
                    id: 1,
                    created_at: 'now',
                },
                {
                    id: 1,
                    created_at: 'now',
                },
            ])
        })
        test('allows ambiguous identifying keys', () => {
            // this situation could happen e.g. if there are rows in different locations in the mutation
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        label: 'test',
                        resource_id: 1,
                    },
                    path: ['categories', 0],
                },
            ]
            const query_results = [
                [
                    {
                        label: 'test',
                        resource_id: 1,
                        created_at: 'now',
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                new Map(),
                { start_index: 0, end_index: 1 },
                ['categories'],
                query_results,
                global_test_schema
            )

            expect(sorted_database_rows).to.deep.equal([
                {
                    label: 'test',
                    resource_id: 1,
                    created_at: 'now',
                },
            ])
        })
        test('works when there is no query for an entity', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        // in this case all data is provided by the user, so there is no
                        // query to fetch extra data
                        $operation: 'update',
                        id: 1,
                        line_1: 'test',
                        resource_id: 1,
                    },
                    path: ['addresses', 0],
                },
            ]

            const query_results = []

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                new Map(),
                { start_index: 0, end_index: 1 },
                [],
                query_results,
                global_test_schema
            )

            // expect a sparse array in slots where there is no database row
            expect(sorted_database_rows).to.deep.equal([undefined])
        })
        test('works with different identifying keys', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        label: 'test',
                    },
                    path: ['categories', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        resource_id: 123,
                    },
                    path: ['categories', 1],
                },
            ]

            const query_results = [
                [
                    {
                        id: 2,
                        resource_id: 123,
                    },
                    {
                        id: 1,
                        label: 'test',
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                new Map(),
                { start_index: 0, end_index: 2 },
                ['categories'],
                query_results,
                global_test_schema
            )

            // expect a sparse array in slots where there is no database row
            expect(sorted_database_rows).to.deep.equal([
                {
                    id: 1,
                    label: 'test',
                },
                {
                    id: 2,
                    resource_id: 123,
                },
            ])
        })
        test('works with guids as the identifying keys', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 'a' },
                        email: 'char@coal.com',
                        $identifying_fields: ['email'],
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        // this is a reference to the user above, so it should resolve to user_id 3
                        user_id: { $guid: 'a' },
                        post_id: 1,
                        $identifying_fields: ['user_id', 'post_id'],
                    },
                    path: ['likes', 0],
                },
            ]

            const mutation_batches: MutationBatch[] = [
                { start_index: 0, end_index: 1 },
                { start_index: 1, end_index: 2 },
            ]
            const guid_map = apply_guid_plan_macro(
                mutation_pieces,
                mutation_batches
            )

            const query_results = [
                [
                    {
                        user_id: 3,
                        post_id: 1,
                    },
                ],
                [
                    {
                        id: 3,
                        email: 'char@coal.com',
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                guid_map,
                mutation_batches[1],
                ['likes', 'users'],
                query_results,
                global_test_schema
            )

            expect(sorted_database_rows).to.deep.equal([
                {
                    user_id: 3,
                    post_id: 1,
                },
            ])
        })
    })
})
