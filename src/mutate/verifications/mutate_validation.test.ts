import { expect } from 'chai'
import { describe, test } from 'mocha'
import {
    GlobalTestMutation,
    global_test_schema,
} from '../../test_data/global_test_schema'
import { validate_mutation } from './mutate_validation'

describe('mutation_validation', () => {
    describe(validate_mutation.name, () => {
        test('rejects object props', () => {
            const test_mutation = {
                $operation: 'create',
                categories: {
                    label: 'hi',
                },
            } as const

            const errors = validate_mutation(test_mutation, global_test_schema)
            const paths = errors.map(error => error.path)
            expect(paths).to.deep.equal([['categories']])
        })
        test('Allows guid object', () => {
            const test_mutation = {
                $operation: 'create',
                posts: [
                    {
                        id: { $guid: '123' },
                        title: 'a',
                        user_id: 1,
                        comments: [
                            {
                                post_id: { $guid: '123' },
                            },
                        ],
                    },
                ],
            } as const satisfies GlobalTestMutation

            const errors = validate_mutation(test_mutation, global_test_schema)
            expect(errors).to.have.lengthOf(0)
        })
        test('recognises inherited operations', () => {
            const test_mutation = {
                $operation: 'create',
                categories: [
                    {
                        // no primary or unique field is needed here because validation recognises that this will be
                        // a create
                        label: 'hi',
                    },
                ],
            } as const satisfies GlobalTestMutation

            const errors = validate_mutation(test_mutation, global_test_schema)
            expect(errors).to.have.lengthOf(0)
        })
        test('allows no top level operation', () => {
            const test_mutation = {
                categories: [
                    {
                        $operation: 'create',
                        label: 'hi',
                    },
                ],
            } as const satisfies GlobalTestMutation

            const errors = validate_mutation(test_mutation, global_test_schema)
            expect(errors).to.have.lengthOf(0)
        })
        test('requires an inherited operation', () => {
            const test_mutation = {
                categories: [
                    {
                        label: 'hi',
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, global_test_schema)
            const paths = errors.map(error => error.path)
            expect(paths).to.deep.equal([['categories', 0, '$operation']])
        })
        // test('requires an identifying key for update', () => {
        //     const test_mutation = {
        //         $operation: 'update',
        //         users: [
        //             {
        //                 last_name: 'smith',
        //             },
        //         ],
        //     }

        //     const errors = validate_mutation(test_mutation, global_test_schema)
        //     expect(errors).to.have.lengthOf(1)
        // })
        test('requires valid field names', () => {
            const test_mutation = {
                $operation: 'create',
                categories: [
                    {
                        label: 'test',
                        not_a_field: 'hi',
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, global_test_schema)
            const paths = errors.map(error => error.path)
            expect(paths).to.deep.equal([['categories', 0, 'not_a_field']])
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

            const errors = validate_mutation(test_mutation, global_test_schema)
            const paths = errors.map(error => error.path)
            expect(paths).to.deep.equal([['not_an_entity']])
        })
        test('allows empty mutations', () => {
            const test_mutation = {
                $operation: 'create',
                posts: [
                    {
                        title: 'test',
                        user_id: true,
                        comments: [],
                    },
                ],
                categories: [],
            }

            const errors = validate_mutation(test_mutation, global_test_schema)
            expect(errors).to.have.lengthOf(0)
        })
        test('requires valid nested entity names', () => {
            const test_mutation = {
                $operation: 'create',
                categories: [
                    {
                        label: 'test',
                        not_an_entity: [],
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, global_test_schema)
            const paths = errors.map(error => error.path)
            expect(paths).to.deep.equal([['categories', 0, 'not_an_entity']])
        })
        test('allows different nestings on top level', () => {
            const test_mutation = {
                $operation: 'update',
                categories: [
                    {
                        $operation: 'create',
                        label: 'test',
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, global_test_schema)
            expect(errors).to.have.lengthOf(0)
        })
        test('required fields must be present in creates', () => {
            const test_mutation = {
                categories: [
                    {
                        $operation: 'create',
                        // label is required here
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, global_test_schema)

            const paths = errors.map(error => error.path)
            expect(paths).to.deep.equal([['categories', 0, 'label']])
        })
        test('allows no required foreign key in a nested create', () => {
            const test_mutation = {
                $operation: 'create',
                posts: [
                    {
                        title: 'test',
                        user_id: 1,
                        comments: [
                            {
                                // post_id id not required here, since the post_id is automatically taken from the
                                // parent post's id
                            },
                        ],
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, global_test_schema)
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

            const errors = validate_mutation(test_mutation, global_test_schema)
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

            const errors = validate_mutation(test_mutation, global_test_schema)
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

            const errors = validate_mutation(test_mutation, global_test_schema)
            expect(errors).to.have.lengthOf(1)
        })
        test('requires valid string', () => {
            const test_mutation = {
                $operation: 'create',
                categories: [
                    {
                        label: '1234567890', // allowed, 10 characters
                    },
                    {
                        label: new Date(), // not allowed - incorrect type
                    },
                    {
                        label: '12345678901', // not allowed - max characters exceeded
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, global_test_schema)
            const paths = errors.map(error => error.path)
            expect(paths).to.deep.equal([
                ['categories', 1, 'label'],
                ['categories', 2, 'label'],
            ])
        })
        test('requires valid number', () => {
            const test_mutation = {
                $operation: 'create',
                categories: [
                    {
                        label: 'a',
                        size: 12, // allowed
                    },
                    {
                        label: 'b',
                        size: '12.1', // allowed
                    },
                    {
                        label: 'c',
                        size: true, // allowed, interpreted as 1
                    },
                    {
                        label: 'd',
                        size: 1.1111, // not allowed - too many decimal places
                    },
                    {
                        label: 'e',
                        size: 123456, // not allowed - too many digits
                    },
                    {
                        label: 'f',
                        size: -12, // not allowed - cant be negative
                    },
                ],
            }

            const errors = validate_mutation(test_mutation, global_test_schema)
            const paths = errors.map(error => error.path)
            expect(paths).to.deep.equal([
                ['categories', 3, 'size'],
                ['categories', 4, 'size'],
                ['categories', 5, 'size'],
            ])
        })
    })
})
