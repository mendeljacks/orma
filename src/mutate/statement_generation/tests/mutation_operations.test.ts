import { expect } from 'chai'
import { describe, test } from 'mocha'
import {
    GlobalTestMutation,
    global_test_schema,
} from '../../../helpers/tests/global_test_schema'
import { MutationPiece } from '../../plan/mutation_plan'
import {
    get_create_ast,
    get_delete_ast,
    get_update_ast,
} from '../mutation_operations'

describe('mutation_operations.ts', () => {
    describe(get_update_ast.name, () => {
        test('update by id', () => {
            const mutation_piece: MutationPiece = {
                record: {
                    $operation: 'update',
                    id: 1,
                    views: 2,
                },
                path: ['posts', 0],
            }

            const result = get_update_ast(
                mutation_piece,
                {},
                global_test_schema
            )

            const goal = {
                $update: 'posts',
                $set: [['views', 2]],
                $where: { $eq: ['id', 1] },
            }

            expect(result).to.deep.equal(goal)
        })
        test('primary key has precedence over unique', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'update',
                        id: 1,
                        title: 'john',
                    },
                ],
            } as const satisfies GlobalTestMutation

            const result = get_update_ast(
                {
                    record: mutation.posts[0],
                    path: ['posts', 0],
                },
                {},
                global_test_schema
            )

            const goal = {
                $update: 'posts',
                $set: [['title', "'john'"]],
                $where: { $eq: ['id', 1] },
            }

            expect(result).to.deep.equal(goal)
        })
        test('update by unique field', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'update',
                        title: 'john',
                        views: 5,
                    },
                ],
            } as const satisfies GlobalTestMutation

            const result = get_update_ast(
                {
                    record: mutation.posts[0],
                    path: ['posts', 0],
                },
                {},
                global_test_schema
            )

            const goal = {
                $update: 'posts',
                $set: [['views', 5]],
                $where: { $eq: ['title', "'john'"] },
            }

            expect(result).to.deep.equal(goal)
        })
        test('throws on no identifying key', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'update',
                        views: 5, // views is not unique, so it can't be used to update with
                    },
                ],
            } as const satisfies GlobalTestMutation

            try {
                const result = get_update_ast(
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                    {},
                    global_test_schema
                )
                expect('should have thrown an error').to.equal(true)
            } catch (error) {
                // error was thrown as it should be
            }
        })
        test('throws on multiple unique update keys', () => {
            const mutation = {
                users: [
                    {
                        $operation: 'update',
                        // having two unique keys like this is ambiguous and throws an error
                        email: 'a@a.com',
                        first_name: 'john',
                        last_name: 'smith',
                        billing_address_id: 1,
                    },
                ],
            } as const satisfies GlobalTestMutation

            try {
                const result = get_update_ast(
                    {
                        record: mutation.users[0],
                        path: ['users', 0],
                    },
                    {},
                    global_test_schema
                )
                expect('should have thrown an error').to.equal(true)
            } catch (error) {}
        })
        test('handles compound primary key', () => {
            const mutation = {
                post_has_categories: [
                    {
                        $operation: 'update',
                        post_id: 1,
                        category_id: 2,
                        main_category: 1,
                    },
                ],
            } as const satisfies GlobalTestMutation

            const result = get_update_ast(
                {
                    record: mutation.post_has_categories[0],
                    path: ['post_has_categories', 0],
                },
                {},
                global_test_schema
            )

            const goal = {
                $update: 'post_has_categories',
                $set: [['main_category', 1]],
                $where: {
                    $and: [
                        {
                            $eq: ['post_id', 1],
                        },
                        {
                            $eq: ['category_id', 2],
                        },
                    ],
                },
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles guid resolving for updates', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'update',
                        id: 1,
                        user_id: { $guid: 'a' },
                    },
                ],
            } as const satisfies GlobalTestMutation

            const values_by_guid = {
                a: 12,
            }

            const result = get_update_ast(
                {
                    record: mutation.posts[0],
                    path: ['posts', 0],
                },
                values_by_guid,
                global_test_schema
            )

            const goal = {
                $update: 'posts',
                $set: [['user_id', 12]],
                $where: { $eq: ['id', 1] },
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles empty update', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'update',
                        id: 1,
                    },
                ],
            } as const satisfies GlobalTestMutation

            const values_by_guid = {}

            const result = get_update_ast(
                {
                    record: mutation.posts[0],
                    path: ['posts', 0],
                },
                values_by_guid,
                global_test_schema
            )

            const goal = undefined

            expect(result).to.deep.equal(goal)
        })
        test('doesnt allow $guid on a chosen identifying key', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'update',
                        // id would usually be chose to identify this row to update, but instead unique1 is chosen
                        // since id is a $guid
                        id: { $guid: 'a' },
                        title: 'test',
                        views: 2,
                    },
                ],
            } as const satisfies GlobalTestMutation

            const values_by_guid = {
                a: 12,
            }

            try {
                const result = get_update_ast(
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                    values_by_guid,
                    global_test_schema
                )
                expect('should have been an error').to.equal(true)
            } catch (error) {}
        })
    })
    describe(get_delete_ast.name, () => {
        // alot of the logic is shared between update and delete functions, so we dont need to repeat all
        // the tests that we already did with the update function
        test('batches deletes', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'delete',
                        id: 4,
                    },
                    {
                        $operation: 'delete',
                        id: 5,
                    },
                ],
            } as const satisfies GlobalTestMutation

            const result = get_delete_ast(
                [
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                    {
                        record: mutation.posts[1],
                        path: ['posts', 1],
                    },
                ],
                'posts',
                {},
                global_test_schema
            )

            const goal = {
                $delete_from: 'posts',
                $where: { $or: [{ $eq: ['id', 4] }, { $eq: ['id', 5] }] },
            }

            expect(result).to.deep.equal(goal)
        })
    })
    describe(get_create_ast.name, () => {
        test('batches creates', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'create',
                        id: 1,
                        user_id: 11,
                    },
                    {
                        $operation: 'create',
                        user_id: 22,
                        id: 2,
                    },
                ],
            } as const satisfies GlobalTestMutation

            const values_by_guid = {
                a: 12,
            }

            const result = get_create_ast(
                [
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                    {
                        record: mutation.posts[1],
                        path: ['posts', 1],
                    },
                ],
                'posts',
                values_by_guid,
                global_test_schema
            )

            const goal = {
                $insert_into: ['posts', ['id', 'user_id']],
                $values: [
                    [1, 11],
                    [2, 22],
                ],
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles creating empty record', () => {
            const mutation = {
                posts: [
                    {
                        $operation: 'create',
                    },
                ],
            } as const satisfies GlobalTestMutation

            const values_by_guid = {
                a: 12,
            }

            const result = get_create_ast(
                [
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                ],
                'posts',
                values_by_guid,
                global_test_schema
            )

            const goal = {
                $insert_into: ['posts', []],
                $values: [[]],
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles guid resolving for creates', () => {
            const mutation = {
                addresses: [
                    {
                        $operation: 'create',
                        id: { $guid: 'a' },
                    },
                ],
            } as const satisfies GlobalTestMutation

            const values_by_guid = {
                a: 12,
            }

            const result = get_create_ast(
                [
                    {
                        record: mutation.addresses[0],
                        path: ['addresses', 0],
                    },
                ],
                'addresses',
                values_by_guid,
                global_test_schema
            )

            const goal = {
                $insert_into: ['addresses', ['id']],
                $values: [[12]],
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles adding default values', () => {
            // in this test, views 0 added since it is the default. SQLite doesn't have a way to say
            // 'use the default value', so orma just puts it in manually. Note that this
            // doesn't work for auto increment, since orma doesn't know what the next
            // auto increment number is.

            const mutation = {
                posts: [
                    {
                        $operation: 'create',
                        title: 'title 1',
                        user_id: 1,
                        views: 1,
                    },
                    {
                        $operation: 'create',
                        title: 'title 2',
                        user_id: 1,
                    },
                ],
            } as const satisfies GlobalTestMutation

            const values_by_guid = {}

            const result = get_create_ast(
                [
                    {
                        record: mutation.posts[0],
                        path: ['posts', 0],
                    },
                    {
                        record: mutation.posts[1],
                        path: ['posts', 1],
                    },
                ],
                'posts',
                values_by_guid,
                global_test_schema
            )

            const goal = {
                $insert_into: ['posts', ['title', 'user_id', 'views']],
                $values: [
                    ["'title 1'", 1, 1],
                    ["'title 2'", 1, 0],
                ],
            }

            expect(result).to.deep.equal(goal)
        })
    })
})
