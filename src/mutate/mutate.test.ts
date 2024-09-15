import { describe, test } from 'mocha'
import {
    register_integration_test,
    test_mutate
} from '../integration_tests/integration_setup.test'
import { GlobalTestMutation } from '../test_data/global_test_schema'
import { expect } from 'chai'

describe('mutate.ts', () => {
    describe('integration tests', () => {
        register_integration_test()
        test('can created based on nested table with connected table check', async () => {
            const mutation = {
                $operation: 'upsert',
                posts: [
                    {
                        title: 'post 1612',
                        user_id: 1,
                        post_has_categories: [
                            {
                                categories: [
                                    {
                                        $operation: 'update',
                                        label: 'Root'
                                    }
                                ]
                            }
                        ]
                    }
                ]
            } as const satisfies GlobalTestMutation

            const res = await test_mutate(mutation, [
                { $table: 'users', $column: 'id', $values: [1] }
            ])

            expect(1).to.equal(1)
        })
        test('handles operation none', async () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'create',
                        title: 'my post 1235',
                        user_id: 1,
                        post_has_categories: [
                            {
                                $operation: 'none'
                            }
                        ]
                    },
                    { $operation: 'none' }
                ]
            } as const satisfies GlobalTestMutation

            const res = await test_mutate(mutation, [
                { $table: 'users', $column: 'id', $values: [1] }
            ])

            expect(1).to.equal(1)
        })
    })
})
