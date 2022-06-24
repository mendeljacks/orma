import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../../../helpers/helpers'
import { OrmaSchema } from '../../../introspector/introspector'
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
        test('ignores updates', () => {
            const mutation = {
                products: [
                    {
                        $operation: 'update',
                        images: [
                            {
                                $operation: 'update',
                                image_urls: [
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

            // no changes
            expect(cloned_mutation).to.deep.equal(mutation)
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

            // no changes
            expect(cloned_mutation).to.deep.equal(mutation)
        })
    })
})
