import { expect } from 'chai'
import { describe, test } from 'mocha'
import {
    GlobalTestMutation,
    global_test_schema
} from '../../../helpers/tests/global_test_schema'
import { apply_guid_inference_macro } from '../guid_inference_macro'
import {
    NestingMutationOutput
} from '../nesting_mutation_macro'

describe('guid_inference_macro.ts', () => {
    describe(apply_guid_inference_macro.name, () => {
        test('adds guids to creates', () => {
            const mutation_pieces: NestingMutationOutput = [
                {
                    record: { $operation: 'create', user_id: 1 },
                    path: ['posts', 0],
                    lower_indices: [1, 2],
                },
                {
                    record: { $operation: 'create' },
                    path: ['posts', 0, 'comments', 0],
                    higher_index: 0,
                    lower_indices: [],
                },
                {
                    record: { $operation: 'create' },
                    path: ['posts', 0, 'comments', 1],
                    higher_index: 0,
                    lower_indices: [],
                },
            ]
            apply_guid_inference_macro(mutation_pieces, global_test_schema)

            // @ts-ignore
            expect(mutation_pieces[0].record.id.$guid).to.not.equal(undefined)
            // @ts-ignore
            expect(mutation_pieces[0].record.id.$guid).to.equal(
                // @ts-ignore
                mutation_pieces[1].record.post_id.$guid
            )

            // @ts-ignore
            expect(mutation_pieces[0].record.id.$guid).to.equal(
                // @ts-ignore
                mutation_pieces[2].record.post_id.$guid
            )
        })
        test('adds guids for deletes', () => {
            const mutation_pieces: NestingMutationOutput = [
                {
                    record: { id: 1, $operation: 'delete' },
                    path: ['comments', 0],
                    lower_indices: [1],
                },
                {
                    record: { id: 2, $operation: 'delete' },
                    path: ['comments', 0, 'posts', 0],
                    higher_index: 0,
                    lower_indices: [],
                },
            ]

            apply_guid_inference_macro(mutation_pieces, global_test_schema)

            // should use the user supplied id in guid inference
            // @ts-ignore
            expect(mutation_pieces[0].record.post_id).to.equal(2)
        })
        test('propagates through nested updates', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'update',
                        comments: [
                            {
                                $operation: 'update',
                            },
                        ],
                    },
                ],
            } as const satisfies GlobalTestMutation

            const mutation_pieces: NestingMutationOutput = [
                {
                    record: { $operation: 'update' },
                    path: ['posts', 0],
                    lower_indices: [1],
                },
                {
                    record: { $operation: 'update' },
                    path: ['posts', 0, 'comments', 0],
                    higher_index: 0,
                    lower_indices: [],
                },
            ]

            apply_guid_inference_macro(mutation_pieces, global_test_schema)

            // no linked guids
            //@ts-ignore
            expect(mutation_pieces[0].record.id).to.deep.equal(
                mutation_pieces[1].record.post_id
            )
        })
        test('ignores parent -> child -> parent ambiguous nesting', () => {
            const mutation_pieces: NestingMutationOutput = [
                {
                    record: { $operation: 'create' },
                    path: ['posts', 0],
                    lower_indices: [1],
                },
                {
                    record: { $operation: 'create' },
                    // this is an ambiguous nesting, since we dont know which product
                    // (the higher or the lower one) should be the parent. So we do nothing.
                    path: ['posts', 0, 'comments', 0],
                    higher_index: 0,
                    lower_indices: [2],
                },
                {
                    record: { $operation: 'create' },
                    path: ['posts', 0, 'comments', 0, 'posts', 0],
                    higher_index: 1,
                    lower_indices: [],
                },
            ]

            apply_guid_inference_macro(mutation_pieces, global_test_schema)

            //@ts-ignore
            expect(mutation_pieces[1].record.post_id).to.equal(undefined)
        })
        test('handles create nested under update', () => {
            const mutation_pieces: NestingMutationOutput = [
                {
                    record: { $operation: 'update', id: 1 },
                    path: ['posts', 0],
                    lower_indices: [1],
                },
                {
                    record: { $operation: 'create' },
                    path: ['posts', 0, 'comments', 0],
                    higher_index: 0,
                    lower_indices: [],
                },
            ]

            apply_guid_inference_macro(mutation_pieces, global_test_schema)

            //@ts-ignore
            expect(mutation_pieces[0].record.id).to.deep.equal(
                mutation_pieces[1].record.post_id
            )
        })
    })
    //TODO: add a test where a guid is provided in the id column, and the foreign key should then use the provided guid, not generate its own
    // (reverse nest if that makes any difference)
})
