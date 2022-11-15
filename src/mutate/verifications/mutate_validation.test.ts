import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import { validate_mutation } from './mutate_validation'

describe('mutation_validation', () => {
    const orma_schema: OrmaSchema = {
        $entities: {
            products: {
                $fields: {
                    id: { data_type: 'int', primary_key: true },
                    vendor_id: {
                        data_type: 'int',
                        character_count: 5,
                        decimal_places: 2,
                        unsigned: true,
                    },
                    name: { character_count: 10, data_type: 'varchar' },
                    description: { data_type: 'varchar' },
                    status: {
                        data_type: 'enum',
                        enum_values: ['published', 'unpublished'],
                    },
                },
                $database_type: 'mysql',
                $indexes: [],
                $foreign_keys: [
                    {
                        from_field: 'vendor_id',
                        to_entity: 'vendors',
                        to_field: 'id',
                    },
                ],
            },
            vendors: {
                $fields: { id: { primary_key: true } },
                $database_type: 'mysql',
            },
            images: {
                $fields: { id: {}, product_id: {} },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'product_id',
                        to_entity: 'products',
                        to_field: 'id',
                    },
                ],
            },
            image_urls: {
                $fields: {
                    url: { data_type: 'varchar' },
                    image_id: { data_type: 'int', not_null: true },
                },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'image_id',
                        to_entity: 'images',
                        to_field: 'id',
                    },
                ],
            },
        },
        $cache: {
            $reversed_foreign_keys: {
                vendors: [
                    {
                        from_field: 'id',
                        to_entity: 'products',
                        to_field: 'vendor_id',
                    },
                ],
                products: [
                    {
                        from_field: 'id',
                        to_entity: 'images',
                        to_field: 'product_id',
                    },
                ],
                images: [
                    {
                        from_field: 'id',
                        to_entity: 'image_urls',
                        to_field: 'image_id',
                    },
                ],
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
        test('Allows guid object', () => {
            const test_mutation = {
                $operation: 'create',
                products: [
                    {
                        id: { $guid: '123' },
                        images: [
                            {
                                product_id: { $guid: '123' },
                            },
                        ],
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(0)
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
        test.skip('requires valid nested operations', () => {
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
        test.skip('requires valid nested operations in reverse nesting', () => {
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
        test('allows different nestings on top level', () => {
            const test_mutation = {
                $operation: 'update',
                products: [
                    {
                        $operation: 'create',
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(0)
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
        test('requires $guids be on foreign / primary keys', () => {
            const test_mutation = {
                $operation: 'create',
                products: [
                    {
                        name: { $guid: 1 }, // not allowed
                        vendor_id: 1,
                    },
                    {
                        id: { $guid: 2 }, // allowed
                        name: 'test',
                        vendor_id: { $guid: 1 }, // allowed
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('does not allow null for non-nullable fields', () => {
            const test_mutation = {
                $operation: 'create',
                image_urls: [
                    {
                        url: null, // allowed
                        image_id: null, // not allowed
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('requires enums be one of the allowed values', () => {
            const test_mutation = {
                $operation: 'create',
                products: [
                    {
                        status: 'published', // allowed
                    },
                    {
                        status: 'this_is_not_in_the_enum', // not allowed
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('requires valid string', () => {
            const test_mutation = {
                $operation: 'create',
                products: [
                    {
                        name: '1234567890', // allowed, 10 characters
                    },
                    {
                        name: new Date(), // not allowed - incorrect type
                    },
                    {
                        name: '12345678901', // not allowed - max characters exceeded
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(2)
        })
        test('requires valid number', () => {
            const test_mutation = {
                $operation: 'create',
                products: [
                    {
                        vendor_id: 12, // allowed
                    },
                    {
                        vendor_id: '12.1', // allowed
                    },
                    {
                        vendor_id: true, // allowed, interpreted as 1
                    },
                    {
                        vendor_id: 1.1111, // not allowed - too many decimal places
                    },
                    {
                        vendor_id: 123456, // not allowed - too many digits
                    },
                    {
                        vendor_id: -12, // not allowed - cant be negative
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, orma_schema)
            expect(errors).to.have.lengthOf(3)
        })
    })
})
