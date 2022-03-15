import { describe, test } from 'mocha'
import { apply_inherit_operations_macro } from './inherit_operations_macro'
import { expect } from 'chai'

describe('inherit_operations_macro', () => {
    describe(apply_inherit_operations_macro.name, () => {
        test('propagates operations', () => {
            const mutation = {
                $operation: 'create',
                products: [
                    {
                        title: 'hi',
                        images: [
                            {
                                url: 'www.test.com/image',
                            },
                        ],
                    },
                ],
            }

            apply_inherit_operations_macro(mutation)

            expect(mutation).to.deep.equal({
                $operation: 'create',
                products: [
                    {
                        $operation: 'create',
                        title: 'hi',
                        images: [
                            {
                                $operation: 'create',
                                url: 'www.test.com/image',
                            },
                        ],
                    },
                ],
            })
        })
        test('respects operation changes', () => {
            const mutation = {
                $operation: 'create',
                products: [
                    {
                        $operation: 'update',
                        id: 1,
                        title: 'hi',
                        images: [
                            {
                                id: 1,
                                url: 'www.test.com/image',
                            },
                        ],
                    },
                ],
            }

            apply_inherit_operations_macro(mutation)

            expect(mutation).to.deep.equal({
                $operation: 'create',
                products: [
                    {
                        $operation: 'update',
                        id: 1,
                        title: 'hi',
                        images: [
                            {
                                $operation: 'update',
                                id: 1,
                                url: 'www.test.com/image',
                            },
                        ],
                    },
                ],
            })
        })
        test('handles undefined operation', () => {
            const mutation = {
                products: [
                    {
                        $operation: 'create',
                        title: 'hi',
                    },
                ],
            }

            apply_inherit_operations_macro(mutation)

            expect(mutation).to.deep.equal({
                products: [
                    {
                        $operation: 'create',
                        title: 'hi',
                    },
                ],
            })
        })
    })
})
