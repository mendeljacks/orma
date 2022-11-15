import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../../introspector/introspector'
import { MutationPiece } from '../../plan/mutation_plan'
import { get_guid_query } from '../mutation_guid_query'

describe('mutation_guid_query.ts', () => {
    const orma_schema: OrmaSchema = {
        $entities: {
            users: {
                $fields: {
                    id: { primary_key: true, not_null: true },
                    first_name: { not_null: true },
                    last_name: { not_null: true },
                    resource_id: { not_null: true },
                },
                $database_type: 'mysql',
                $indexes: [
                    { fields: ['resource_id'], is_unique: true },
                    { fields: ['first_name', 'last_name'], is_unique: true },
                ],
            },
        },
        $cache: { $reversed_foreign_keys: {} },
    }

    describe(get_guid_query.name, () => {
        test('generates a giud query', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'a' },
                        resource_id: 123,
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: 1 },
                        first_name: 'john',
                        last_name: 'smith',
                    },
                    path: ['users', 0],
                },
                {
                    record: {
                        $operation: 'delete',
                        id: 1,
                    },
                    path: ['products', 1],
                },
            ]

            const result = get_guid_query(
                mutation_pieces,
                'users',
                {},
                orma_schema
            )

            expect(result).to.deep.equal({
                $select: ['id', 'resource_id', 'first_name', 'last_name'],
                $from: 'users',
                $where: {
                    $or: [
                        {
                            $eq: ['resource_id', 123],
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
                'users',
                {},
                orma_schema
            )

            expect(result).to.deep.equal(undefined)
        })
    })
})
