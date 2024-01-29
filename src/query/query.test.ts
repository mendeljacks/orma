import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../test_data/global_test_schema'
import { orma_nester } from './query'

describe('query.ts', () => {
    describe(orma_nester.name, () => {
        test('nests restults', () => {
            const result = orma_nester(
                global_test_schema,
                {
                    posts: {
                        users: {}
                    }
                },
                [],
                [
                    [['posts'], [{ user_id: 1 }]],
                    [['posts', 'users'], [{ id: 1 }]]
                ]
            )

            expect(result).to.deep.equal({
                posts: [
                    {
                        user_id: 1,
                        users: [
                            {
                                id: 1
                            }
                        ]
                    }
                ]
            })
        })
    })
})
