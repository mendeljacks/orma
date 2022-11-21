import { expect } from 'chai'
import { describe, test } from 'mocha'
import { as_orma_schema } from '../../../query/query'
import { MutationPiece } from '../../plan/mutation_plan'
import { sort_database_rows } from '../sort_database_rows'

describe('guid_processing.ts', () => {
    const schema = as_orma_schema({
        $entities: {
            products: {
                $fields: {
                    id: { primary_key: true, not_null: true },
                    title: { not_null: true },
                    resource_id: { not_null: true },
                },
                $database_type: 'mysql',
                $indexes: [
                    { fields: ['title'], is_unique: true },
                    { fields: ['resource_id'], is_unique: true },
                ],
            },
            images: {
                $fields: {
                    id: { not_null: true, primary_key: true },
                    product_id: {},
                    resource_id: { not_null: true },
                },
                $database_type: 'mysql',
                $indexes: [{ fields: ['resource_id'], is_unique: true }],
                $foreign_keys: [
                    {
                        from_field: 'product_id',
                        to_entity: 'products',
                        to_field: 'id',
                    },
                ],
            },
            users: {
                $fields: {
                    first_name: { primary_key: true, not_null: true },
                    last_name: { primary_key: true, not_null: true },
                    age: {},
                },
                $database_type: 'mysql',
            },
        },
        $cache: {
            $reversed_foreign_keys: {
                products: [
                    {
                        from_field: 'id',
                        to_entity: 'images',
                        to_field: 'product_id',
                    },
                ],
            },
        },
    })

    describe(sort_database_rows.name, () => {
        test('throws if not enough mysql results', () => {
            try {
                sort_database_rows([], [], [], {}, schema)
                expect('should throw an error').to.equal(true)
            } catch (error) {}
        })
        test('sorts mutation pieces', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'a' },
                        title: 'my product 1',
                    },
                    path: ['products', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 'b' },
                        title: 'my product 2',
                    },
                    path: ['products', 1],
                },
            ]
            const query_results = [
                [
                    {
                        id: 2,
                        title: 'my product 2',
                    },
                    {
                        id: 1,
                        title: 'my product 1',
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                ['products'],
                query_results,
                {},
                schema
            )

            expect(sorted_database_rows).to.deep.equal([
                {
                    id: 1,
                    title: 'my product 1',
                },
                {
                    id: 2,
                    title: 'my product 2',
                },
            ])
        })
        test('sorts rows from multiple queries', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'a' },
                        title: 'my product 1',
                    },
                    path: ['products', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 'b' },
                        resource_id: 2,
                    },
                    path: ['images', 0],
                },
            ]
            const query_results = [
                [
                    {
                        id: 11,
                        title: 'my product 1',
                    },
                ],
                [
                    {
                        id: 22,
                        resource_id: 2,
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                ['products', 'images'],
                query_results,
                {},
                schema
            )

            expect(sorted_database_rows).to.deep.equal([
                {
                    id: 11,
                    title: 'my product 1',
                },
                {
                    id: 22,
                    resource_id: 2,
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
                schema
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
                        title: 'test 1',
                    },
                    path: ['products', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        title: 'test 2',
                    },
                    path: ['products', 1],
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
                ['products'],
                query_results,
                {},
                schema
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
                        title: 'test',
                        resource_id: 1,
                    },
                    path: ['products', 0],
                },
            ]
            const query_results = [
                [
                    {
                        title: 'test',
                        resource_id: 1,
                        created_at: 'now',
                    },
                ],
            ]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                ['products'],
                query_results,
                {},
                schema
            )

            // the single database row is matched to both mutation pieces, since the two mutation pieces
            // have the same id
            expect(sorted_database_rows).to.deep.equal([
                {
                    title: 'test',
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
                        title: 'test',
                        resource_id: 1,
                    },
                    path: ['products', 0],
                },
            ]
            const query_results = []

            const queries = []

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                queries,
                query_results,
                {},
                schema
            )

            // expect a sparse array in slots where there is no database row
            expect(sorted_database_rows).to.deep.equal([undefined])
        })
        test.skip('works with guids as the identifying keys')
    })
})
