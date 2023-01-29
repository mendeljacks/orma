import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import {
    get_database_uniqueness_errors,
    get_duplicate_record_indices,
    get_mutation_uniqueness_errors,
    get_verify_uniqueness_query,
} from './verify_uniqueness'
import { expect } from 'chai'
import { MutationPiece, MutationPlan } from '../plan/mutation_plan'

describe.only('verify_uniqueness.ts', () => {
    const orma_schema: OrmaSchema = {
        $entities: {
            users: {
                $fields: {
                    id: { primary_key: true, not_null: true },
                    first_name: { not_null: true },
                    last_name: { not_null: true },
                    age: {},
                },
                $database_type: 'mysql',
                $indexes: [
                    {
                        index_name: 'unique',
                        fields: ['first_name', 'last_name'],
                        is_unique: true,
                    },
                ],
            },
            products: {
                $fields: {
                    id: { primary_key: true, not_null: true },
                    title: { not_null: true },
                    description: {},
                },
                $database_type: 'mysql',
                $indexes: [
                    {
                        index_name: 'unique',
                        fields: ['title'],
                        is_unique: true,
                    },
                ],
            },
        },
    }

    describe(get_verify_uniqueness_query.name, () => {
        test('searches on primary key', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                products: [
                    {
                        path: ['products'],
                        record: {
                            $operation: 'update',
                            id: 12,
                            description: 'hi',
                        },
                    },
                ],
            }

            const result = get_verify_uniqueness_query(
                orma_schema,
                mutation_pieces_by_entity
            )

            expect(result).to.deep.equal({
                products: {
                    id: true,
                    title: true,
                    $where: {
                        $in: ['id', [12]],
                    },
                },
            })
        })
        test('searches on unique keys', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                users: [
                    {
                        path: ['users'],
                        record: {
                            $operation: 'update',
                            first_name: 'john', // combo unique
                            last_name: 'smith', // combo unique
                            age: 20,
                        },
                    },
                ],
            }

            const result = get_verify_uniqueness_query(
                orma_schema,
                mutation_pieces_by_entity,
            )

            expect(result).to.deep.equal({
                users: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    $where: {
                        $and: [
                            {
                                $eq: ['first_name', "'john'"],
                            },
                            {
                                $eq: ['last_name', "'smith'"],
                            },
                        ],
                    },
                },
            })
        })
        test('only updates and deletes', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                products: [
                    {
                        $operation: 'update',
                        id: 12,
                        description: 'hi',
                    },
                    {
                        $operation: 'delete',
                        id: 13,
                    },
                    {
                        $operation: 'create',
                        id: 14,
                        description: 'hi',
                    },
                ].map(el => ({ path: ['products'], record: el })) as MutationPiece[],
            }

            const result = get_verify_uniqueness_query(
                orma_schema,
                mutation_pieces_by_entity,
            )

            expect(result).to.deep.equal({
                products: {
                    id: true,
                    title: true,
                    $where: {
                        $in: ['id', [12]],
                    },
                },
            })
        })
        test('searches multiple entities and fields', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                products: [
                    {
                        $operation: 'update',
                        id: 12,
                        description: 'hi',
                    },
                    {
                        $operation: 'update',
                        title: 'chair',
                        description: 'hi',
                    },
                ].map(el => ({ path: ['products'], record: el })) as MutationPiece[],
                users: [
                    {
                        $operation: 'update',
                        id: 13,
                        first_name: 'john',
                    },
                ].map(el => ({ path: ['users'], record: el })) as MutationPiece[],
            }

            const result = get_verify_uniqueness_query(
                orma_schema,
                mutation_pieces_by_entity,
            )

            expect(result).to.deep.equal({
                products: {
                    id: true,
                    title: true,
                    $where: {
                        $or: [
                            {
                                $in: ['id', [12]],
                            },
                            {
                                $in: ['title', ["'chair'"]],
                            },
                        ],
                    },
                },
                users: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    $where: {
                        $in: ['id', [13]],
                    },
                },
            })
        })
    })
    describe(get_duplicate_record_indices.name, () => {
        test('gets duplicates', () => {
            const records1 = [
                {
                    field1: 'a',
                    field2: 'b',
                    field3: 'c',
                },
                {
                    field1: 'a',
                    field2: 'x',
                },
            ]
            const records2 = [
                {
                    field1: 'x',
                    field2: 'b',
                },
                {
                    field1: 'a',
                    field2: 'b',
                },
            ]

            const result = get_duplicate_record_indices(records1, records2, [
                'field1',
                'field2',
            ])

            expect(result).to.deep.equal([[0, 1]])
        })
        test('works for no duplicates', () => {
            const records1 = [
                {
                    field1: 'a',
                },
            ]
            const records2 = []

            const result = get_duplicate_record_indices(records1, records2, [
                'field1',
                'field2',
            ])

            expect(result).to.deep.equal([])
        })
    })
    describe(get_database_uniqueness_errors.name, () => {
        test('gets uniqueness errors', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                users: [
                    {
                        path: ['users', 0],
                        record: {
                            $operation: 'update',
                            id: 12,
                            first_name: 'john',
                        },
                    },
                ],
                products: [
                    {
                        path: ['products', 0],
                        record: {
                            $operation: 'update',
                            id: 13,
                            title: 'hi',
                        },
                    },
                ],
            }

            const database_records_by_entity = {
                users: [
                    {
                        id: 12,
                        first_name: 'john',
                    },
                ],
                products: [
                    {
                        id: 13,
                        title: 'hi',
                    },
                ],
            }

            const errors = get_database_uniqueness_errors(
                orma_schema,
                mutation_pieces_by_entity,
                database_records_by_entity,
            )

            expect(errors.length).to.equal(3)
        })
    })
    describe(get_mutation_uniqueness_errors.name, () => {
        test('gets uniqueness errors', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                users: [
                    {
                        record: {
                            $operation: 'update',
                            id: 12,
                            first_name: 'john',
                            last_name: 'smith',
                        },
                        path: ['users', 0],
                    },
                    {
                        record: {
                            $operation: 'update',
                            id: 13,
                            first_name: 'john',
                            last_name: 'doe',
                        },
                        path: ['users', 1],
                    },
                    {
                        record: {
                            $operation: 'update',
                            id: 14,
                            first_name: 'john',
                            last_name: 'smith',
                        },
                        path: ['users', 2],
                    },
                ],
                products: [
                    {
                        record: {
                            $operation: 'update',
                            id: 13,
                            title: 'hi',
                        },
                        path: ['products', 0],
                    },
                ],
            }

            const errors = get_mutation_uniqueness_errors(
                orma_schema,
                mutation_pieces_by_entity,
            )

            expect(errors.length).to.equal(2)
        })
    })
})
