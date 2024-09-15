import { expect } from 'chai'
import { describe, test } from 'mocha'
import { group_by } from '../../helpers/helpers'
import { global_test_schema } from '../../test_data/global_test_schema'
import { path_to_table } from '../helpers/mutate_helpers'
import { MutationPiece } from '../plan/mutation_batches'
import {
    get_database_uniqueness_errors,
    get_duplicate_record_indices,
    get_mutation_uniqueness_errors,
    get_verify_uniqueness_query
} from './verify_uniqueness'

describe('verify_uniqueness.ts', () => {
    describe(get_verify_uniqueness_query.name, () => {
        test('searches unique key', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'update',
                        id: 12,
                        title: 'hi',
                        $identifying_columns: ['id']
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const result = get_verify_uniqueness_query(
                global_test_schema,
                { mutation_pieces, guid_map: new Map() },
                piece_indices_by_table
            )

            expect(result).to.deep.equal({
                posts: {
                    id: true,
                    title: true,
                    $where: {
                        $eq: ['title', { $escape: 'hi' }]
                    }
                }
            })
        })
        test('searches combo unique', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'update',
                        id: 12,
                        email: 'a@a.com',
                        first_name: 'john', // combo unique
                        last_name: 'smith', // combo unique
                        age: 20,
                        $identifying_columns: ['id']
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const result = get_verify_uniqueness_query(
                global_test_schema,
                { mutation_pieces, guid_map: new Map() },
                piece_indices_by_table
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
                                $eq: ['email', { $escape: 'a@a.com' }]
                            },
                            {
                                $eq: [
                                    ['first_name', 'last_name'],
                                    [{ $escape: 'john' }, { $escape: 'smith' }]
                                ]
                            }
                        ]
                    }
                }
            })
        })
        test('only updates and creates', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    $operation: 'update',
                    id: 12,
                    title: 'hi',
                    $identifying_columns: ['id']
                },
                {
                    $operation: 'delete',
                    id: 13,
                    title: 'as',
                    $identifying_columns: ['id']
                },
                {
                    $operation: 'create',
                    id: 14,
                    user_id: 1,
                    title: '123'
                }
            ].map((el, i) => ({
                path: ['posts', i],
                record: el
            })) as MutationPiece[]

            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const result = get_verify_uniqueness_query(
                global_test_schema,
                { mutation_pieces, guid_map: new Map() },
                piece_indices_by_table
            )

            expect(result).to.deep.equal({
                posts: {
                    id: true,
                    title: true,
                    $where: {
                        $or: [
                            {
                                $eq: ['id', { $escape: 14 }]
                            },
                            {
                                $in: [
                                    'title',
                                    [{ $escape: 'hi' }, { $escape: '123' }]
                                ]
                            }
                        ]
                    }
                }
            })
        })
        test('handles no unique columns', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'update',
                        // not used as a unique column since it is the identifying column and so is not being edited
                        title: 'hi',
                        views: 123,
                        $identifying_columns: ['title']
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const result = get_verify_uniqueness_query(
                global_test_schema,
                { mutation_pieces, guid_map: new Map() },
                piece_indices_by_table
            )

            expect(result).to.deep.equal({})
        })
        test('handles part of combo unique', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'update',
                        // changing first_name can cause a unique constraint to be violated,
                        // even though it is a combo unique with last_name. To check this though,
                        // we have to fetch both first_name and last_name
                        id: 1,
                        first_name: 'john',
                        $identifying_columns: ['id']
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const result = get_verify_uniqueness_query(
                global_test_schema,
                { mutation_pieces, guid_map: new Map() },
                piece_indices_by_table
            )

            expect(result).to.deep.equal({
                users: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    $where: {
                        $eq: ['first_name', { $escape: 'john' }]
                    }
                }
            })
        })
        test('handles combo unique', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'update',
                        id: 1,
                        first_name: 'john',
                        last_name: 'smith',
                        $identifying_columns: ['id']
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const result = get_verify_uniqueness_query(
                global_test_schema,
                { mutation_pieces, guid_map: new Map() },
                piece_indices_by_table
            )

            expect(result).to.deep.equal({
                users: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    $where: {
                        $eq: [
                            ['first_name', 'last_name'],
                            [{ $escape: 'john' }, { $escape: 'smith' }]
                        ]
                    }
                }
            })
        })
        test('ignores $guid', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'create',
                        id: { $guid: 1, $write: true },
                        email: 'a@a.com',
                        first_name: { $guid: 1 },
                        last_name: 'smith'
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const result = get_verify_uniqueness_query(
                global_test_schema,
                { mutation_pieces, guid_map: new Map() },
                piece_indices_by_table
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
                                $eq: ['email', { $escape: 'a@a.com' }]
                            },
                            {
                                $eq: ['last_name', { $escape: 'smith' }]
                            }
                        ]
                    }
                }
            })
        })
        test('searches multiple tables and columns', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'update',
                        id: 1,
                        title: 'title 1',
                        $identifying_columns: ['id']
                    }
                },
                {
                    path: ['posts', 1],
                    record: {
                        $operation: 'update',
                        id: 2,
                        title: 'title 2',
                        $identifying_columns: ['id']
                    }
                },
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'update',
                        id: 11,
                        email: 'a@a.com',
                        $identifying_columns: ['id']
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const result = get_verify_uniqueness_query(
                global_test_schema,
                { mutation_pieces, guid_map: new Map() },
                piece_indices_by_table
            )

            expect(result).to.deep.equal({
                posts: {
                    id: true,
                    title: true,
                    $where: {
                        $in: [
                            'title',
                            [{ $escape: 'title 1' }, { $escape: 'title 2' }]
                        ]
                    }
                },
                users: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true,
                    $where: {
                        $eq: ['email', { $escape: 'a@a.com' }]
                    }
                }
            })
        })
    })
    describe(get_duplicate_record_indices.name, () => {
        test('gets duplicates', () => {
            const records1 = [
                {
                    column1: 'a',
                    column2: 'b',
                    column3: 'c'
                },
                {
                    column1: 'a',
                    column2: 'x'
                }
            ]
            const records2 = [
                {
                    column1: 'x',
                    column2: 'b'
                },
                {
                    column1: 'a',
                    column2: 'b'
                }
            ]

            const result = get_duplicate_record_indices(records1, records2, [
                'column1',
                'column2'
            ])

            expect(result).to.deep.equal([[0, 1]])
        })
        test('works for no duplicates', () => {
            const records1 = [
                {
                    column1: 'a'
                }
            ]
            const records2 = []

            const result = get_duplicate_record_indices(records1, records2, [
                'column1',
                'column2'
            ])

            expect(result).to.deep.equal([])
        })
    })
    describe(get_database_uniqueness_errors.name, () => {
        test('gets uniqueness errors', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'update',
                        id: 12,
                        email: 'a',
                        $identifying_columns: ['id']
                    }
                },
                {
                    path: ['categories', 0],
                    record: {
                        $operation: 'update',
                        id: 13,
                        label: 'hi',
                        $identifying_columns: ['id']
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const database_records_by_table = {
                users: [
                    {
                        id: 1,
                        email: 'a'
                    }
                ],
                categories: [
                    {
                        id: 2,
                        label: 'hi'
                    }
                ]
            }

            const errors = get_database_uniqueness_errors(
                global_test_schema,
                mutation_pieces,
                piece_indices_by_table,
                database_records_by_table
            )

            const paths = errors.map(error => error.path)
            expect(paths).to.deep.equal([
                ['users', 0],
                ['categories', 0]
            ])
        })
        test('does not generate an error for identifying keys on update', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['addresses', 0],
                    record: {
                        $operation: 'update',
                        id: 12,
                        line_1: 'a',
                        $identifying_columns: ['id']
                    }
                },
                {
                    path: ['addresses', 0],
                    record: {
                        $operation: 'create',
                        id: 12,
                        line_1: 'c'
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const database_records_by_table = {
                addresses: [
                    {
                        id: 12,
                        line_1: 'b'
                    }
                ]
            }

            const errors = get_database_uniqueness_errors(
                global_test_schema,
                mutation_pieces,
                piece_indices_by_table,
                database_records_by_table
            )

            expect(errors.length).to.equal(1)
        })
        test('does not generate an error for only part of a combo unique', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'update',
                        id: 12,
                        first_name: 'john',
                        last_name: 'a',
                        $identifying_columns: ['id']
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const database_records_by_table = {
                users: [
                    {
                        id: 12,
                        first_name: 'john',
                        last_name: 'b'
                    }
                ]
            }

            const errors = get_database_uniqueness_errors(
                global_test_schema,
                mutation_pieces,
                piece_indices_by_table,
                database_records_by_table
            )

            expect(errors.length).to.equal(0)
        })
        test('does not generate an error for nulls', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'update',
                        id: 12,
                        email: null,
                        $identifying_columns: ['id']
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const database_records_by_table = {
                users: [
                    {
                        id: 12,
                        email: null
                    }
                ]
            }

            const errors = get_database_uniqueness_errors(
                global_test_schema,
                mutation_pieces,
                piece_indices_by_table,
                database_records_by_table
            )

            expect(errors.length).to.equal(0)
        })
        test('does not generate an error for nulls', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'update',
                        id: 12,
                        email: {},
                        $identifying_columns: ['id']
                    }
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const database_records_by_table = {
                users: [
                    {
                        id: 12,
                        email: null
                    }
                ]
            }

            const errors = get_database_uniqueness_errors(
                global_test_schema,
                mutation_pieces,
                piece_indices_by_table,
                database_records_by_table
            )

            expect(errors.length).to.equal(0)
        })
    })
    describe(get_mutation_uniqueness_errors.name, () => {
        test('gets uniqueness errors', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 12,
                        first_name: 'john',
                        last_name: 'smith',
                        $identifying_columns: ['id']
                    },
                    path: ['users', 0]
                },
                {
                    record: {
                        $operation: 'update',
                        id: 13,
                        first_name: 'john',
                        last_name: 'doe',
                        $identifying_columns: ['id']
                    },
                    path: ['users', 1]
                },
                {
                    record: {
                        $operation: 'update',
                        id: 14,
                        first_name: 'john',
                        last_name: 'smith',
                        $identifying_columns: ['id']
                    },
                    path: ['users', 2]
                },
                {
                    record: {
                        $operation: 'update',
                        id: 13,
                        line_1: 'hi',
                        $identifying_columns: ['id']
                    },
                    path: ['addresses', 0]
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const errors = get_mutation_uniqueness_errors(
                global_test_schema,
                mutation_pieces,
                piece_indices_by_table
            )

            expect(errors.length).to.equal(2)
        })
        test('ignores same identifying keys', () => {
            // same identifying key is technically a bit ambiguous but is allowed because it wont generate an sql error
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 12,
                        $identifying_columns: ['id']
                    },
                    path: ['users', 0]
                },
                {
                    record: {
                        $operation: 'update',
                        id: 12,
                        $identifying_columns: ['id']
                    },
                    path: ['users', 1]
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const errors = get_mutation_uniqueness_errors(
                global_test_schema,
                mutation_pieces,
                piece_indices_by_table
            )

            expect(errors.length).to.equal(0)
        })
        test('ignores objects', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 12,
                        email: [{}],
                        $identifying_columns: ['id']
                    },
                    path: ['users', 0]
                },
                {
                    record: {
                        $operation: 'update',
                        id: 12,
                        email: [{}],
                        $identifying_columns: ['id']
                    },
                    path: ['users', 1]
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const errors = get_mutation_uniqueness_errors(
                global_test_schema,
                mutation_pieces,
                piece_indices_by_table
            )

            expect(errors.length).to.equal(0)
        })
        test('ignores deletes', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'delete',
                        id: 12,
                        email: 'a@a.com',
                        $identifying_columns: ['id']
                    },
                    path: ['users', 0]
                },
                {
                    record: {
                        $operation: 'delete',
                        id: 12,
                        email: 'a@a.com',
                        $identifying_columns: ['id']
                    },
                    path: ['users', 1]
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const errors = get_mutation_uniqueness_errors(
                global_test_schema,
                mutation_pieces,
                piece_indices_by_table
            )

            expect(errors.length).to.equal(0)
        })
        test('handles partially null unique keys', () => {
            // none of these cause sql errors
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        tax_code: 'TAX1',
                        tax_subcode: '1'
                    },
                    path: ['tax_codes', 0]
                },
                {
                    record: {
                        $operation: 'create',
                        tax_code: 'TAX1',
                        tax_subcode: '2'
                    },
                    path: ['tax_codes', 0]
                },
                {
                    record: {
                        $operation: 'create',
                        tax_code: 'TAX1',
                        tax_subcode: null
                    },
                    path: ['tax_codes', 0]
                },
                {
                    record: {
                        $operation: 'create',
                        tax_code: 'TAX1',
                        tax_subcode: null
                    },
                    path: ['tax_codes', 0]
                },
                {
                    record: {
                        $operation: 'create',
                        tax_code: 'TAX1'
                    },
                    path: ['tax_codes', 0]
                },
                {
                    record: {
                        $operation: 'create',
                        tax_code: 'TAX1'
                    },
                    path: ['tax_codes', 0]
                }
            ]
            const piece_indices_by_table =
                get_piece_indices_by_table(mutation_pieces)

            const errors = get_mutation_uniqueness_errors(
                global_test_schema,
                mutation_pieces,
                piece_indices_by_table
            )

            expect(errors.length).to.equal(0)
        })
    })
})

const get_piece_indices_by_table = (mutation_pieces: MutationPiece[]) =>
    group_by(
        mutation_pieces.map((_, i) => i),
        piece_index => path_to_table(mutation_pieces[piece_index].path)
    )
