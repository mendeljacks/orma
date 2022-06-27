import { expect } from 'chai'
import { describe, test } from 'mocha'
import { as_orma_schema } from '../../../query/query'
import { replace_guids_with_values, save_guids } from '../guid_processing'
import { sort_database_rows } from '../sort_database_rows'

describe('guid_processing.ts', () => {
    const schema = as_orma_schema({
        products: {
            id: {
                primary_key: true,
                not_null: true,
            },
            title: {
                not_null: true,
            },
            $indexes: [
                {
                    fields: ['title'],
                    is_unique: true,
                },
                {
                    fields: ['resource_id'],
                    is_unique: true,
                },
            ],
            resource_id: {
                not_null: true,
            },
        },
        images: {
            id: {
                not_null: true,
                primary_key: true,
            },
            product_id: {
                references: {
                    products: {
                        id: {},
                    },
                },
            },
            resource_id: {
                not_null: true,
            },
            $indexes: [
                {
                    fields: ['resource_id'],
                    is_unique: true,
                },
            ],
        },
        users: {
            first_name: {
                primary_key: true,
                not_null: true,
            },
            last_name: {
                primary_key: true,
                not_null: true,
            },
            age: {},
        },
    })

    describe(sort_database_rows.name, () => {
        test('throws if not enough mysql results', () => {
            try {
                sort_database_rows([], [{}], [], schema)
                expect('should throw an error').to.equal(true)
            } catch (error) {}
        })
        test('sorts mutation pieces', () => {
            const mutation_pieces = [
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

            const queries = [{ $from: 'products' }]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                queries,
                query_results,
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
            const mutation_pieces = [
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

            const queries = [{ $from: 'products' }, { $from: 'images' }]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                queries,
                query_results,
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
            const mutation_pieces = [
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

            const queries = [{ $from: 'users' }]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                queries,
                query_results,
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
            const mutation_pieces = [
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

            const queries = [{ $from: 'products' }]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                queries,
                query_results,
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
            const mutation_pieces = [
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

            const queries = [{ $from: 'products' }]

            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                queries,
                query_results,
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
    })
})
