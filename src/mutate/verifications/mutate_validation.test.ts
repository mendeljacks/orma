import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import { validate_mutation } from './mutate_validation'

describe('mutation_validation', () => {
    const orma_schema: OrmaSchema = {
        products: {
            id: {
                data_type: 'int',
                primary_key: true,
            },
            vendor_id: {
                data_type: 'int',
                references: {
                    vendors: {
                        id: {},
                    },
                },
            },
            name: {
                data_type: 'varchar',
            },
            description: {
                data_type: 'varchar',
            },
            $indexes: [],
        },
        vendors: {
            id: {
                primary_key: true,
            },
        },
        images: {
            id: {},
            product_id: {
                references: {
                    products: {
                        id: {},
                    },
                },
            },
        },
        image_urls: {
            image_id: {
                not_null: true,
                references: {
                    images: {
                        id: {},
                    },
                },
            },
        },
    }

    describe(validate_mutation.name, () => {
        test('rejects object props', () => {
            const test_mutation = {
                $operation: 'create',
                products: {
                    name: 'hi',
                },
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('recognises inherited operations', () => {
            const test_mutation = {
                $operation: 'create',
                products: [
                    {
                        // no primary or unique field is needed here because validation recognises that this will be
                        // a create
                        name: 'hi',
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(0)
        })
        test('allows no top level operation', () => {
            const test_mutation = {
                products: [
                    {
                        $operation: 'create',
                        name: 'hi',
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(0)
        })
        test('requires an inherited operation', () => {
            const test_mutation = {
                products: [
                    {
                        name: 'hi',
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('requires an identifying key for update', () => {
            const test_mutation = {
                $operation: 'update',
                products: [
                    {
                        name: 'hi',
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('requires valid field names', () => {
            const test_mutation = {
                $operation: 'create',
                products: [
                    {
                        not_a_field: 'hi',
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('requires valid top-level entity names', () => {
            const test_mutation = {
                $operation: 'create',
                not_an_entity: [
                    {
                        not_a_field: 'hi',
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('allows empty mutations', () => {
            const test_mutation = {
                $operation: 'create',
                products: [
                    {
                        vendors: [],
                    },
                ],
                vendors: [],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(0)
        })
        test('requires valid nested entity names', () => {
            const test_mutation = {
                $operation: 'create',
                products: [
                    {
                        not_an_entity: [],
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('requires valid nested operations', () => {
            const test_mutation = {
                $operation: 'create',
                vendors: [
                    {
                        // vendors is a create, but you cant create a parent and update a child
                        products: [
                            {
                                $operation: 'update',
                                id: 1,
                            },
                        ],
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('requires valid nested operations in reverse nesting', () => {
            const test_mutation = {
                products: [
                    {
                        $operation: 'delete',
                        id: 1,
                        vendors: [
                            {
                                // vendors is actually the parent of products, so this operation nesting is illegal
                                $operation: 'create',
                            },
                        ],
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('required fields must be present in creates', () => {
            const test_mutation = {
                image_urls: [
                    {
                        $operation: 'create',
                        // image_id is required here
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('allows no required foreign key in a nested create', () => {
            const test_mutation = {
                $operation: 'create',
                images: [
                    {
                        image_urls: [
                            {
                                // image_id id not required here, since the image_id is automatically taken from the
                                // parent image's id
                            },
                        ],
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(0)
        })
    })
})
