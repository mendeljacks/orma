import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import {
    get_database_uniqueness_errors,
    get_duplicate_record_indices,
    get_mutation_uniqueness_errors,
    get_verify_uniqueness_query,
} from './verify_uniqueness'
import { expect } from 'chai'

describe('verify_uniqueness', () => {
    const orma_schema: OrmaSchema = {
        users: {
            id: {
                primary_key: true,
                not_null: true,
            },
            first_name: {
                not_null: true,
            },
            last_name: {
                not_null: true,
            },
            age: {},
            $indexes: [
                {
                    index_name: 'unique',
                    fields: ['first_name', 'last_name'],
                    is_unique: true,
                },
            ],
        },
        products: {
            id: {
                primary_key: true,
                not_null: true,
            },
            title: {
                not_null: true,
            },
            description: {},
            $indexes: [
                {
                    index_name: 'unique',
                    fields: ['title'],
                    is_unique: true,
                },
            ],
        },
    }
    describe(get_verify_uniqueness_query.name, () => {
        test('searches on primary key', () => {
            const pathed_records_by_entity = {
                products: [
                    {
                        record: {
                            $operation: 'update',
                            id: 12,
                            description: 'hi',
                        },
                    },
                ],
            }

            const result = get_verify_uniqueness_query(
                pathed_records_by_entity,
                orma_schema
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
            const pathed_records_by_entity = {
                users: [
                    {
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
                pathed_records_by_entity,
                orma_schema
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
        test('only searches updates and deletes', () => {
            const pathed_records_by_entity = {
                products: [
                    {
                        record: {
                            $operation: 'update',
                            id: 12,
                            description: 'hi',
                        },
                    },
                    {
                        record: {
                            $operation: 'delete',
                            id: 13,
                        },
                    },
                    {
                        record: {
                            $operation: 'create',
                            id: 14,
                            description: 'hi',
                        },
                    },
                ],
            }

            const result = get_verify_uniqueness_query(
                pathed_records_by_entity,
                orma_schema
            )

            expect(result).to.deep.equal({
                products: {
                    id: true,
                    title: true,
                    $where: {
                        $in: ['id', [12, 13]],
                    },
                },
            })
        })
        test('searches multiple entities and fields', () => {
            const pathed_records_by_entity = {
                products: [
                    {
                        record: {
                            $operation: 'update',
                            id: 12,
                            description: 'hi',
                        },
                    },
                    {
                        record: {
                            $operation: 'update',
                            title: 'chair',
                            description: 'hi',
                        },
                    },
                ],
                users: [
                    {
                        record: {
                            $operation: 'update',
                            id: 13,
                            first_name: 'john',
                        },
                    },
                ],
            }

            const result = get_verify_uniqueness_query(
                pathed_records_by_entity,
                orma_schema
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
            const mutation_pathed_records_by_id = {
                users: [
                    {
                        record: {
                            id: 12,
                            first_name: 'john',
                        },
                    },
                ],
                products: [
                    {
                        record: {
                            id: 13,
                            title: 'hi',
                        },
                    },
                ],
            }

            const database_records_by_id = {
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
                mutation_pathed_records_by_id,
                database_records_by_id,
                {},
                orma_schema
            )

            expect(errors.length).to.equal(3)
        })
    })
    describe(get_mutation_uniqueness_errors.name, () => {
        test('gets uniqueness errors', () => {
            const mutation_pathed_records_by_id = {
                users: [
                    {
                        record: {
                            id: 12,
                            first_name: 'john',
                            last_name: 'smith',
                        },
                        path: ['users', 0],
                    },
                    {
                        record: {
                            id: 13,
                            first_name: 'john',
                            last_name: 'doe',
                        },
                    },
                    {
                        record: {
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
                            id: 13,
                            title: 'hi',
                        },
                    },
                ],
            }

            const errors = get_mutation_uniqueness_errors(
                mutation_pathed_records_by_id,
                {},
                orma_schema
            )

            expect(errors.length).to.equal(2)
        })
    })
})
