import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import {
    get_database_uniqueness_errors,
    get_duplicate_record_indices,
    get_mutation_uniqueness_errors,
    get_unique_verification_errors,
    get_verify_uniqueness_query,
} from './verify_uniqueness'
import { expect } from 'chai'
import {
    get_mutation_plan,
    MutationPiece,
    MutationPlan,
} from '../plan/mutation_plan'

describe('verify_uniqueness.ts', () => {
    const orma_schema: OrmaSchema = {
        $entities: {
            users: {
                $fields: {
                    id: { primary_key: true, not_null: true },
                    first_name: { not_null: true },
                    last_name: { not_null: true },
                    email: { not_null: true },
                    age: {},
                },
                $database_type: 'mysql',
                $indexes: [
                    {
                        index_name: 'unique',
                        fields: ['first_name', 'last_name'],
                        is_unique: true,
                    },
                    {
                        index_name: 'unique2',
                        fields: ['email'],
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
        // test('test case', async () => {
        //     const mutation = {
        //         $operation: 'create',
        //         products: [
        //             { title: '1', variants: [{ sku: 'test' }] },
        //             { title: '2', variants: [{ sku: 'test' }] },
        //         ],
        //     }
        //     const plan = get_mutation_plan(
        //         mutation,
        //         orma_schema as any as OrmaSchema
        //     )
        //     const errors = await get_unique_verification_errors(
        //         orma_schema as any as OrmaSchema,
        //         () => { return [] } as any,
        //         plan
        //     )
        //     return errors
        // })
        test('searches unique key', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                products: [
                    {
                        path: ['products'],
                        record: {
                            $operation: 'update',
                            id: 12,
                            title: 'hi',
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
                        $eq: ['title', { $escape: 'hi' }],
                    },
                },
            })
        })
        test('searches combo unique', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                users: [
                    {
                        path: ['users'],
                        record: {
                            $operation: 'update',
                            id: 12,
                            email: 'a@a.com',
                            first_name: 'john', // combo unique
                            last_name: 'smith', // combo unique
                            age: 20,
                        },
                    },
                ],
            }

            const result = get_verify_uniqueness_query(
                orma_schema,
                mutation_pieces_by_entity
            )

            expect(result).to.deep.equal({
                users: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true,
                    $where: {
                        $or: [
                            {
                                $and: [
                                    {
                                        $eq: [
                                            'first_name',
                                            { $escape: 'john' },
                                        ],
                                    },
                                    {
                                        $eq: [
                                            'last_name',
                                            { $escape: 'smith' },
                                        ],
                                    },
                                ],
                            },
                            {
                                $eq: ['email', { $escape: 'a@a.com' }],
                            },
                        ],
                    },
                },
            })
        })
        test('only updates and creates', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                products: [
                    {
                        $operation: 'update',
                        id: 12,
                        title: 'hi',
                    },
                    {
                        $operation: 'delete',
                        id: 13,
                        title: 'as',
                    },
                    {
                        $operation: 'create',
                        id: 14,
                        title: '123',
                    },
                ].map((el, i) => ({
                    path: ['products', i],
                    record: el,
                })) as MutationPiece[],
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
                        $or: [
                            {
                                $eq: ['title', { $escape: 'hi' }],
                            },
                            {
                                $eq: ['id', { $escape: 14 }],
                            },
                            {
                                $eq: ['title', { $escape: '123' }],
                            },
                        ],
                    },
                },
            })
        })
        test('handles no unique fields', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                products: [
                    {
                        $operation: 'update',
                        // not used as a unique field since it is the identifying field and so is not being edited
                        description: 'hi',
                        title: '123',
                    },
                ].map((el, i) => ({
                    path: ['products', i],
                    record: el,
                })) as MutationPiece[],
            }

            const result = get_verify_uniqueness_query(
                orma_schema,
                mutation_pieces_by_entity
            )

            expect(result).to.deep.equal({})
        })
        test('handles part of combo unique', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                users: [
                    {
                        $operation: 'update',
                        // changing first_name can cause a unique constraint to be violated,
                        // even though it is a combo unique with last_name. To check this though,
                        // we have to fetch both first_name and last_name
                        id: 1,
                        first_name: 'john',
                    },
                ].map((el, i) => ({
                    path: ['users', i],
                    record: el,
                })) as MutationPiece[],
            }

            const result = get_verify_uniqueness_query(
                orma_schema,
                mutation_pieces_by_entity
            )

            expect(result).to.deep.equal({
                users: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    $where: {
                        $eq: ['first_name', { $escape: 'john' }],
                    },
                },
            })
        })
        test('handles combo unique', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                users: [
                    {
                        $operation: 'update',
                        id: 1,
                        first_name: 'john',
                        last_name: 'smith',
                    },
                ].map((el, i) => ({
                    path: ['users', i],
                    record: el,
                })) as MutationPiece[],
            }

            const result = get_verify_uniqueness_query(
                orma_schema,
                mutation_pieces_by_entity
            )

            expect(result).to.deep.equal({
                users: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    $where: {
                        $and: [
                            {
                                $eq: ['first_name', { $escape: 'john' }],
                            },
                            {
                                $eq: ['last_name', { $escape: 'smith' }],
                            },
                        ],
                    },
                },
            })
        })
        test('ignores $guid', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                users: [
                    {
                        $operation: 'create',
                        id: { $guid: 1 },
                        email: 'a@a.com',
                        first_name: { $guid: 1 },
                        last_name: 'smith',
                    },
                ].map((el, i) => ({
                    path: ['users', i],
                    record: el,
                })) as MutationPiece[],
            }

            const result = get_verify_uniqueness_query(
                orma_schema,
                mutation_pieces_by_entity
            )

            expect(result).to.deep.equal({
                users: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    $where: {
                        $or: [
                            {
                                $eq: ['last_name', { $escape: 'smith' }],
                            },
                            {
                                $eq: ['email', { $escape: 'a@a.com' }],
                            },
                        ],
                    },
                },
            })
        })
        test('searches multiple entities and fields', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                products: [
                    {
                        $operation: 'update',
                        id: 1,
                        title: 'title 1',
                    },
                    {
                        $operation: 'update',
                        id: 2,
                        title: 'title 2',
                    },
                ].map((el, i) => ({
                    path: ['products', i],
                    record: el,
                })) as MutationPiece[],
                users: [
                    {
                        $operation: 'update',
                        id: 11,
                        email: 'a@a.com',
                    },
                ].map((el, i) => ({
                    path: ['users', i],
                    record: el,
                })) as MutationPiece[],
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
                        $or: [
                            {
                                $eq: ['title', { $escape: 'title 1' }],
                            },
                            {
                                $eq: ['title', { $escape: 'title 2' }],
                            },
                        ],
                    },
                },
                users: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true,
                    $where: {
                        $eq: ['email', { $escape: 'a@a.com' }],
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
                            email: 'a',
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
                        email: 'a',
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
                database_records_by_entity
            )

            expect(errors.length).to.equal(2)
        })
        test('does not generate an error for identifying keys on update', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                products: [
                    {
                        path: ['products', 0],
                        record: {
                            $operation: 'update',
                            id: 12,
                            title: 'a',
                        },
                    },
                    {
                        path: ['products', 0],
                        record: {
                            $operation: 'create',
                            id: 12,
                            title: 'c',
                        },
                    },
                ],
            }

            const database_records_by_entity = {
                products: [
                    {
                        id: 12,
                        title: 'b',
                    },
                ],
            }

            const errors = get_database_uniqueness_errors(
                orma_schema,
                mutation_pieces_by_entity,
                database_records_by_entity
            )

            expect(errors.length).to.equal(1)
        })
        test('does not generate an error for only part of a combo unique', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                users: [
                    {
                        path: ['users', 0],
                        record: {
                            $operation: 'update',
                            id: 12,
                            first_name: 'john',
                            last_name: 'a',
                        },
                    },
                ],
            }

            const database_records_by_entity = {
                users: [
                    {
                        id: 12,
                        first_name: 'john',
                        last_name: 'b',
                    },
                ],
            }

            const errors = get_database_uniqueness_errors(
                orma_schema,
                mutation_pieces_by_entity,
                database_records_by_entity
            )

            expect(errors.length).to.equal(0)
        })
        test('does not generate an error for nulls', () => {
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                users: [
                    {
                        path: ['users', 0],
                        record: {
                            $operation: 'update',
                            id: 12,
                            email: null,
                        },
                    },
                ],
            }

            const database_records_by_entity = {
                users: [
                    {
                        id: 12,
                        email: null,
                    },
                ],
            }

            const errors = get_database_uniqueness_errors(
                orma_schema,
                mutation_pieces_by_entity,
                database_records_by_entity
            )

            expect(errors.length).to.equal(0)
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
                mutation_pieces_by_entity
            )

            expect(errors.length).to.equal(2)
        })
        test('ignores same identifying keys', () => {
            // same identifying key is technically a bit ambiguous but is allowed because it wont generate an sql error
            const mutation_pieces_by_entity: Record<string, MutationPiece[]> = {
                users: [
                    {
                        record: {
                            $operation: 'update',
                            id: 12,
                        },
                        path: ['users', 0],
                    },
                    {
                        record: {
                            $operation: 'update',
                            id: 12,
                        },
                        path: ['users', 1],
                    },
                ],
            }

            const errors = get_mutation_uniqueness_errors(
                orma_schema,
                mutation_pieces_by_entity
            )

            expect(errors.length).to.equal(0)
        })
    })
})
