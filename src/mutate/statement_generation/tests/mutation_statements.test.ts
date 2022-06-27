import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../../introspector/introspector'
import { MutationPiece } from '../../plan/mutation_plan'
import { get_mutation_statements } from '../mutation_statements'

describe('mutation_statements.ts', () => {
    const orma_schema: OrmaSchema = {
        users: {
            id: {
                primary_key: true,
                not_null: true,
            },
            first_name: { not_null: true },
            last_name: { not_null: true },
            resource_id: { not_null: true },
            $indexes: [
                {
                    fields: ['resource_id'],
                    is_unique: true,
                },
                {
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
        },
    }
    describe(get_mutation_statements.name, () => {
        test('throws on unrecognized operation', () => {
            try {
                get_mutation_statements(
                    [
                        {
                            record: { $operation: 'asdasdas' },
                            path: ['parents', 0],
                        },
                    ],
                    {},
                    {}
                )
                expect('should throw an error').to.equal(true)
            } catch (error) {}
        })
        test('gets mutation statements', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: 1,
                        country_id: { $guid: 'a' },
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        first_name: 'john',
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        $operation: 'delete',
                        id: 1,
                    },
                    path: ['products', 0],
                },
                {
                    record: {
                        $operation: 'create',
                        id: 1,
                    },
                    path: ['users', 0],
                },
            ]

            const values_by_guid = {
                a: 11,
            }
            const result = get_mutation_statements(
                mutation_pieces,
                values_by_guid,
                orma_schema
            )

            // the result massive because this function is intentionally badly designed. It is providing convenience
            // to the user by duplicating data, since it provides the mutation pieces, the ast (which is computed
            // solely by the mutation peices) and the sql string (which is computed solely by the ast). Well
            // designed functions would just take mutation pieces and return asts, or take asts and return sql
            // strings, but well designed functions are harderto use and require more knowledge on what to do for
            // the user. So its like this to be as easy as possible to get orma working
            expect(result).to.deep.equal({
                mutation_infos: [
                    {
                        ast: {
                            $insert_into: ['users', ['id', 'country_id']],
                            $values: [
                                [1, 11],
                                [1, 'NULL'],
                            ],
                        },
                        operation: 'create',
                        entity: 'users',
                        mutation_pieces: [
                            mutation_pieces[0],
                            mutation_pieces[3],
                        ],
                        sql_string:
                            'INSERT INTO users (id, country_id) VALUES (1, 11), (1, NULL)',
                    },
                    {
                        ast: {
                            $update: 'users',
                            $set: [['first_name', "'john'"]],
                            $where: {
                                $eq: ['id', 1],
                            },
                        },
                        operation: 'update',
                        entity: 'users',
                        mutation_pieces: [mutation_pieces[1]],
                        sql_string:
                            "UPDATE users SET first_name = 'john' WHERE id = 1",
                    },
                    {
                        ast: {
                            $delete_from: 'products',
                            $where: {
                                $eq: ['id', 1],
                            },
                        },
                        operation: 'delete',
                        entity: 'products',
                        mutation_pieces: [mutation_pieces[2]],
                        sql_string: 'DELETE FROM products WHERE id = 1',
                    },
                ],
                query_infos: [
                    {
                        $select: ['country_id', 'id'],
                        $from: 'users',
                        $where: {
                            $or: [
                                {
                                    $eq: ['id', 1],
                                },
                                {
                                    $eq: ['id', 1],
                                },
                                {
                                    $eq: ['id', 1],
                                },
                            ],
                        },
                    },
                ],
            })
        })
    })
})
