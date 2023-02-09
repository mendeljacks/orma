import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../../../helpers/helpers'
import {
    GlobalTestMutation,
    GlobalTestSchema,
    global_test_schema,
} from '../../../helpers/tests/global_test_schema'
import { OrmaMutation } from '../../../types/mutation/mutation_types'
import { apply_guid_inference_macro } from '../guid_inference_macro'

describe.only('guid_inference_macro.ts', () => {
    // const global_test_schema = as_orma_global_test_schema({
    //     $entities: {
    //         products: {
    //             $fields: { id: { primary_key: true, not_null: true } },
    //             $database_type: 'mysql',
    //         },
    //         images: {
    //             $fields: {
    //                 id: { primary_key: true, not_null: true },
    //                 product_id: { not_null: true },
    //             },
    //             $database_type: 'mysql',
    //             $foreign_keys: [
    //                 {
    //                     from_field: 'product_id',
    //                     to_entity: 'products',
    //                     to_field: 'id',
    //                 },
    //             ],
    //         },
    //         image_urls: {
    //             $fields: {
    //                 id: { primary_key: true, not_null: true },
    //                 image_id: { not_null: true },
    //             },
    //             $database_type: 'mysql',
    //             $foreign_keys: [
    //                 {
    //                     from_field: 'image_id',
    //                     to_entity: 'images',
    //                     to_field: 'id',
    //                 },
    //             ],
    //         },
    //     },
    //     $cache: {
    //         $reversed_foreign_keys: {
    //             products: [
    //                 {
    //                     from_field: 'id',
    //                     to_entity: 'images',
    //                     to_field: 'product_id',
    //                 },
    //             ],
    //             images: [
    //                 {
    //                     from_field: 'id',
    //                     to_entity: 'image_urls',
    //                     to_field: 'image_id',
    //                 },
    //             ],
    //         },
    //     },
    // })

    describe(apply_guid_inference_macro.name, () => {
        test.only('adds guids to creates', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'create',
                        id: { $guid: 1 },
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
            expect(mutation.products[0].id.$guid).to.not.equal(undefined)
            // @ts-ignore
            expect(mutation.products[0].id.$guid).to.equal(
                // @ts-ignore
                mutation.products[0].images[0].product_id.$guid
            )

            // @ts-ignore
            expect(mutation.products[0].id.$guid).to.equal(
                // @ts-ignore
                mutation.products[0].images[1].product_id.$guid
            )
        })
        test('adds guids for deletes', () => {
            const mutation = {
                images: [
                    {
                        id: 1,
                        $operation: 'delete',
                        products: [
                            {
                                id: 2,
                                $operation: 'delete',
                            },
                        ],
                    },
                ],
            }

            apply_guid_inference_macro(mutation, global_test_schema)

            // should use the user supplied id in guid inference
            // @ts-ignore
            expect(mutation.images[0].product_id).to.equal(2)
        })
        test('ignores nested updates', () => {
            const mutation = {
                products: [
                    {
                        $operation: 'update',
                        images: [
                            {
                                $operation: 'update',
                            },
                        ],
                    },
                ],
            }

            const cloned_mutation = clone(mutation)

            apply_guid_inference_macro(mutation, global_test_schema)

            // no linked guids
            //@ts-ignore
            expect(cloned_mutation.products[0].images[0].product_id).to.equal(
                undefined
            )
        })
        test('ignores parent -> child -> parent ambiguous nesting', () => {
            const mutation = {
                products: [
                    {
                        $operation: 'create',
                        images: [
                            {
                                // this is an ambiguous nesting, since we dont know which product
                                // (the higher or the lower one) should be the parent. So we do nothing.
                                $operation: 'create',
                                products: [
                                    {
                                        $operation: 'create',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }

            const cloned_mutation = clone(mutation)

            apply_guid_inference_macro(mutation, global_test_schema)

            // no linked guids
            //@ts-ignore
            expect(cloned_mutation.products[0].images[0].product_id).to.equal(
                undefined
            )
        })
        test('handles create nested under update', () => {
            const mutation = {
                products: [
                    {
                        $operation: 'update',
                        id: 1,
                        images: [
                            {
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            apply_guid_inference_macro(mutation, global_test_schema)

            //@ts-ignore
            expect(mutation.products[0].images[0].product_id).to.deep.equal(1)
        })
    })
    //TODO: add a test where a guid is provided in the id column, and the foreign key should then use the provided guid, not generate its own
    // (reverse nest if that makes any difference)
})
