import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../../helpers/tests/global_test_schema'
import { MutationPiece } from '../../plan/mutation_plan'
import { sort_database_rows } from '../sort_database_rows'

describe.only('guid_processing.ts', () => {
    // const global_test_schema = as_orma_global_test_schema({
    //     $entities: {
    //         addresses: {
    //             $fields: {
    //                 id: { primary_key: true, not_null: true },
    //                 line_1: { not_null: true },
    //                 resource_id: { not_null: true },
    //             },
    //             $database_type: 'mysql',
    //             $indexes: [
    //                 { fields: ['line_1'], is_unique: true },
    //                 { fields: ['resource_id'], is_unique: true },
    //             ],
    //         },
    //         images: {
    //             $fields: {
    //                 id: { not_null: true, primary_key: true },
    //                 product_id: {},
    //                 resource_id: { not_null: true },
    //             },
    //             $database_type: 'mysql',
    //             $indexes: [{ fields: ['resource_id'], is_unique: true }],
    //             $foreign_keys: [
    //                 {
    //                     from_field: 'product_id',
    //                     to_entity: 'addresses',
    //                     to_field: 'id',
    //                 },
    //             ],
    //         },
    //         users: {
    //             $fields: {
    //                 first_name: { primary_key: true, not_null: true },
    //                 last_name: { primary_key: true, not_null: true },
    //                 age: {},
    //             },
    //             $database_type: 'mysql',
    //         },
    //     },
    //     $cache: {
    //         $reversed_foreign_keys: {
    //             addresses: [
    //                 {
    //                     from_field: 'id',
    //                     to_entity: 'images',
    //                     to_field: 'product_id',
    //                 },
    //             ],
    //         },
    //     },
    // })

    describe(sort_database_rows.name, () => {
        test('throws if not enough mysql results', () => {
            try {
                sort_database_rows([], [], [], {}, global_test_schema)
                expect('should throw an error').to.equal(true)
            } catch (error) {}
        })
        test('sorts mutation pieces', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'a' },
                        line_1: 'my product 1',
                    },
                    path: ['addresses', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 'b' },
                        line_1: 'my product 2',
                    },
                    path: ['addresses', 1],
                },
            ]
            const query_results = [
                [
                    {
                        id: 2,
                        line_1: 'my product 2',
                    },
                    {
                        id: 1,
                        line_1: 'my product 1',
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                ['addresses'],
                query_results,
                {},
                global_test_schema
            )

            expect(sorted_database_rows).to.deep.equal([
                {
                    id: 1,
                    line_1: 'my product 1',
                },
                {
                    id: 2,
                    line_1: 'my product 2',
                },
            ])
        })
        test('sorts rows from multiple queries', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'a' },
                        line_1: 'my product 1',
                    },
                    path: ['addresses', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 'b' },
                        post_id: 2,
                    },
                    path: ['comments', 0],
                },
            ]
            const query_results = [
                [
                    {
                        id: 11,
                        line_1: 'my product 1',
                    },
                ],
                [
                    {
                        id: 22,
                        post_id: 2,
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                ['addresses', 'comments'],
                query_results,
                {},
                global_test_schema
            )

            expect(sorted_database_rows).to.deep.equal([
                {
                    id: 11,
                    line_1: 'my product 1',
                },
                {
                    id: 22,
                    post_id: 2,
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
                    path: ['users', 0],
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
                ['users'],
                query_results,
                {},
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
                ['addresses'],
                query_results,
                {},
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
                        line_1: 'test',
                        resource_id: 1,
                    },
                    path: ['addresses', 0],
                },
            ]
            const query_results = [
                [
                    {
                        line_1: 'test',
                        resource_id: 1,
                        created_at: 'now',
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                ['addresses'],
                query_results,
                {},
                global_test_schema
            )

            // the single database row is matched to both mutation pieces, since the two mutation pieces
            // have the same id
            expect(sorted_database_rows).to.deep.equal([
                {
                    line_1: 'test',
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
                [],
                query_results,
                {},
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
                        line_1: 'test',
                    },
                    path: ['addresses', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        resource_id: 123,
                    },
                    path: ['addresses', 1],
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
                        line_1: 'test',
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                ['addresses'],
                query_results,
                {},
                global_test_schema
            )

            // expect a sparse array in slots where there is no database row
            expect(sorted_database_rows).to.deep.equal([
                {
                    id: 1,
                    line_1: 'test',
                },
                {
                    id: 2,
                    resource_id: 123,
                },
            ])
        })
        test.skip('works with guids as the identifying keys')
    })
})
