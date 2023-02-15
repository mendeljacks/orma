import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../../../helpers/helpers'
import {
    GlobalTestMutation,
    global_test_schema,
} from '../../../helpers/tests/global_test_schema'
import { apply_guid_inference_macro } from '../guid_inference_macro'

describe('guid_inference_macro.ts', () => {
    describe(apply_guid_inference_macro.name, () => {
        test('adds guids to creates', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'create',
                        user_id: 1,
                        comments: [
                            {
                                $operation: 'create',
                            },
                            {
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            } as const satisfies GlobalTestMutation

            apply_guid_inference_macro(mutation, global_test_schema)

            // @ts-ignore
            expect(mutation.posts[0].id.$guid).to.not.equal(undefined)
            // @ts-ignore
            expect(mutation.posts[0].id.$guid).to.equal(
                // @ts-ignore
                mutation.posts[0].comments[0].post_id.$guid
            )

            // @ts-ignore
            expect(mutation.posts[0].id.$guid).to.equal(
                // @ts-ignore
                mutation.posts[0].comments[1].post_id.$guid
            )
        })
        test('adds guids for deletes', () => {
            const mutation = {
                comments: [
                    {
                        id: 1,
                        $operation: 'delete',
                        posts: [
                            {
                                id: 2,
                                $operation: 'delete',
                            },
                        ],
                    },
                ],
            } as const satisfies GlobalTestMutation

            apply_guid_inference_macro(mutation, global_test_schema)

            // should use the user supplied id in guid inference
            // @ts-ignore
            expect(mutation.comments[0].post_id).to.equal(2)
        })
        test('ignores nested updates', () => {
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

            const cloned_mutation = clone(mutation)

            apply_guid_inference_macro(mutation, global_test_schema)

            // no linked guids
            //@ts-ignore
            expect(cloned_mutation.posts[0].comments[0].psot_id).to.equal(
                undefined
            )
        })
        test('ignores parent -> child -> parent ambiguous nesting', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'create',
                        comments: [
                            {
                                // this is an ambiguous nesting, since we dont know which product
                                // (the higher or the lower one) should be the parent. So we do nothing.
                                $operation: 'create',
                                posts: [
                                    {
                                        $operation: 'create',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            } as const satisfies GlobalTestMutation

            const cloned_mutation = clone(mutation)

            apply_guid_inference_macro(mutation, global_test_schema)

            // no linked guids
            //@ts-ignore
            expect(cloned_mutation.posts[0].comments[0].post_id).to.equal(
                undefined
            )
        })
        test('handles create nested under update', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'update',
                        id: 1,
                        comments: [
                            {
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            } as const satisfies GlobalTestMutation

            apply_guid_inference_macro(mutation, global_test_schema)

            //@ts-ignore
            expect(mutation.posts[0].comments[0].post_id).to.deep.equal(1)
        })
    })
    //TODO: add a test where a guid is provided in the id column, and the foreign key should then use the provided guid, not generate its own
    // (reverse nest if that makes any difference)
})
