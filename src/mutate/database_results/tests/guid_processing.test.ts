import { expect } from 'chai'
import { describe, test } from 'mocha'
import { as_orma_schema } from '../../../query/query'
import { MutationPiece } from '../../plan/mutation_plan'
import { replace_guids_with_values, save_guids } from '../guid_processing'

describe('guid_processing.ts', () => {
    // const schema = as_orma_schema({
    //     products: {
    //         id: {
    //             primary_key: true,
    //             not_null: true,
    //         },
    //         title: {
    //             not_null: true,
    //         },
    //         $indexes: [
    //             {
    //                 fields: ['title'],
    //             },
    //         ],
    //     },
    //     images: {
    //         id: {
    //             not_null: true,
    //             primary_key: true,
    //         },
    //         product_id: {
    //             references: {
    //                 products: {
    //                     id: {},
    //                 },
    //             },
    //         },
    //     },
    // })

    describe(save_guids.name, () => {
        test('saves guids', () => {
            const values_by_guids = {}
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'a' },
                    },
                    path: ['products', 0],
                },
                {
                    record: {
                        $operation: 'create',
                        id: { $guid: 'b' },
                    },
                    path: ['products', 1],
                },
            ]
            const database_rows = [
                {
                    id: 1,
                },
                {
                    id: 2,
                },
            ]

            save_guids(values_by_guids, mutation_pieces, database_rows)

            expect(values_by_guids).to.deep.equal({
                a: 1,
                b: 2,
            })
        })
        test('ignores non-guid fields', () => {
            const values_by_guids = {}
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        id: 5,
                        images: {
                            $operation: 'update',
                            product_id: 5,
                        },
                    },
                    path: ['products', 0],
                },
            ]
            const database_rows = [
                {
                    id: 1,
                },
                {
                    id: 2,
                },
            ]

            save_guids(values_by_guids, mutation_pieces, database_rows)

            expect(values_by_guids).to.deep.equal({})
        })
        test('handles undefined database rows', () => {
            const values_by_guids = {}
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'create',
                        title: 'test'
                    },
                    path: ['products', 0],
                },
            ]
            const database_rows = [
                undefined
            ]

            save_guids(values_by_guids, mutation_pieces, database_rows)

            expect(values_by_guids).to.deep.equal({})
        })
    })
    describe(replace_guids_with_values.name, () => {
        test('replaces guids', () => {
            const mutation = {
                products: [{
                    id: { $guid: 'a'},
                    title: 'my product'
                }]
            }
            const values_by_guid = {
                a: 12
            }

            replace_guids_with_values(mutation, values_by_guid)

            expect(mutation).to.deep.equal({
                products: [{
                    id: 12,
                    title: 'my product'
                }]
            })
        })
    })
})
