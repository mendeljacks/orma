import { expect } from 'chai'
import { describe, test } from 'mocha'
import { apply_nesting_mutation_macro } from '../nesting_mutation_macro'

describe('nesting_mutation_macro.ts', () => {
    describe(apply_nesting_mutation_macro.name, () => {
        test('handles nesting', () => {
            const mutation = {
                users: [
                    {
                        $operation: 'update',
                        id: 1,
                        email: 'a@a.com',
                        posts: [
                            {
                                $operation: 'create',
                                title: 'Test',
                                comments: [{}],
                            },
                            {
                                id: 1,
                                title: 'Test 2',
                            },
                        ],
                    },
                ],
            }

            const result = apply_nesting_mutation_macro(mutation)
            expect(result).to.deep.equal([
                {
                    record: mutation.users[0],
                    path: ['users', 0],
                    lower_indices: [1, 2],
                },
                {
                    record: mutation.users[0].posts[0],
                    path: ['users', 0, 'posts', 0],
                    higher_index: 0,
                    lower_indices: [3],
                },
                {
                    record: mutation.users[0].posts[1],
                    path: ['users', 0, 'posts', 1],
                    higher_index: 0,
                    lower_indices: [],
                },
                {
                    record: mutation.users[0].posts[0].comments[0],
                    path: ['users', 0, 'posts', 0, 'comments', 0],
                    higher_index: 1,
                    lower_indices: [],
                },
            ])
        })
        test('handles multiple top level props', () => {
            const mutation = {
                $operation: 'update',
                users: [
                    {
                        id: 1,
                        email: 'a@a.com',
                    },
                ],
                posts: [
                    {
                        id: 1,
                        title: 'Test 2',
                    },
                ],
            }

            const result = apply_nesting_mutation_macro(mutation)
            expect(result).to.deep.equal([
                {
                    record: { id: 1, email: 'a@a.com' },
                    path: ['users', 0],
                    lower_indices: [],
                },
                {
                    record: { id: 1, title: 'Test 2' },
                    path: ['posts', 0],
                    lower_indices: [],
                },
            ])
        })
    })
})
