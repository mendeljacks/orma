import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../../../helpers/helpers'
import { as_orma_schema } from '../../../query/query'
import { apply_guid_inference_macro } from '../guid_inference_macro'

describe('guid_inference_macro.ts', () => {
    const schema = as_orma_schema({
        products: {
            id: {
                primary_key: true,
                not_null: true,
            },
        },
        images: {
            id: {
                primary_key: true,
                not_null: true,
            },
            product_id: {
                not_null: true,
                references: {
                    products: {
                        id: {},
                    },
                },
            },
        },
        image_urls: {
            id: {
                primary_key: true,
                not_null: true,
            },
            image_id: {
                not_null: true,
                references: {
                    images: {
                        id: {},
                    },
                },
            },
        },
    })

    describe(apply_guid_inference_macro.name, () => {
        test('adds guids to creates', () => {
            const mutation = {
                products: [
                    {
                        $operation: 'create',
                        images: [
                            {
                                $operation: 'create',
                            },
                            {
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            apply_guid_inference_macro(mutation, schema)

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

            apply_guid_inference_macro(mutation, schema)

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

            apply_guid_inference_macro(mutation, schema)

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

            apply_guid_inference_macro(mutation, schema)

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

            apply_guid_inference_macro(mutation, schema)

            //@ts-ignore
            expect(mutation.products[0].images[0].product_id).to.deep.equal(1)
        })
    })
    //TODO: add a test where a guid is provided in the id column, and the foreign key should then use the provided guid, not generate its own
    // (reverse nest if that makes any difference)
})
