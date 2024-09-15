import { expect } from 'chai'
import { validate_inner, ValidationSchema } from './validator'
import { test, describe } from 'mocha'

describe.only('validator.ts', () => {
    test('handles simple types', () => {
        const tests: { schema: ValidationSchema; valid: any; invalid: any }[] =
            [
                {
                    schema: { enum: new Set([1, 'hi']) },
                    valid: 'hi',
                    invalid: 2
                },
                {
                    schema: { type: 'null' },
                    valid: null,
                    invalid: 2
                },
                {
                    schema: { type: 'boolean' },
                    valid: true,
                    invalid: 1
                },
                {
                    schema: { type: 'number' },
                    valid: -10.2,
                    invalid: null
                },
                {
                    schema: { type: 'number', minimum: 0, maximum: 10 },
                    valid: 5,
                    invalid: -1
                },
                {
                    schema: { type: 'integer', minimum: -2 },
                    valid: -1,
                    invalid: -1.5
                },
                {
                    schema: { type: 'string' },
                    valid: 'test',
                    invalid: 1
                },
                {
                    schema: { type: 'string', minLength: 4 },
                    valid: 'test',
                    invalid: 'tes'
                },
                {
                    schema: { type: 'string', minLength: 1, maxLength: 4 },
                    valid: 'test',
                    invalid: 'test1'
                },
                {
                    schema: {
                        type: 'object',
                        properties: { a: { type: 'string' } }
                    },
                    valid: { a: 'test' },
                    invalid: 1
                },
                {
                    schema: {
                        type: 'object',
                        properties: { a: { type: 'string' } }
                    },
                    valid: { b: 2 },
                    invalid: { a: 1 }
                },
                {
                    schema: {
                        type: 'object',
                        properties: { a: { type: 'string' } },
                        required: ['a']
                    },
                    valid: { a: 'test', b: 2 },
                    invalid: { b: 1 }
                },
                {
                    schema: {
                        type: 'array',
                        items: { type: 'number' }
                    },
                    valid: [1, 2],
                    invalid: 'test'
                },
                {
                    schema: {
                        type: 'array',
                        items: { type: 'number' },
                        minItems: 0,
                        maxItems: 2
                    },
                    valid: [],
                    invalid: [1, 2, 3]
                },
                {
                    schema: {
                        type: 'array',
                        prefixItems: [{ type: 'number' }, { type: 'string' }]
                    },
                    valid: [1, 'test', 1],
                    invalid: [1, 2]
                },
                {
                    schema: {
                        type: 'array',
                        items: { type: 'string' },
                        prefixItems: [{ type: 'number' }]
                    },
                    valid: [1, 'hi'],
                    invalid: ['hi', 'hi']
                }
            ]

        expect(validate_inner({}, [], { a: 'test' })).to.deep.equal([])

        for (const test of tests) {
            const valid_result = validate_inner(test.schema, test.valid, [])
            const invalid_result = validate_inner(test.schema, test.invalid, [])
            expect(valid_result).length.to.equal(0)
            expect(invalid_result).length.to.be.greaterThan(0)
        }
    })
})
