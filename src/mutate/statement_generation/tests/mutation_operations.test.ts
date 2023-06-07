import { expect } from 'chai'
import { describe, test } from 'mocha'
import {
    GlobalTestMutation,
    global_test_schema,
} from '../../../test_data/global_test_schema'
import { apply_guid_plan_macro } from '../../macros/guid_plan_macro'
import { MutationPiece } from '../../plan/mutation_batches'
import {
    get_create_ast,
    get_delete_ast,
    get_update_ast,
} from '../mutation_operations'

describe('mutation_operations.ts', () => {
    describe(get_update_ast.name, () => {
        test('update by id', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    record: {
                        $operation: 'update',
                        id: 1,
                        views: 2,
                        $identifying_fields: ['id'],
                    },
                    path: ['posts', 0],
                },
            ]

            const result = get_update_ast(
                mutation_pieces,
                0,
                new Map(),
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
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: {
                        $identifying_fields: ['id'],
                        $operation: 'update',
                        id: 1,
                        title: 'john',
                    },
                },
            ]

            const result = get_update_ast(
                mutation_pieces,
                0,
                new Map(),
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
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'update',
                        title: 'john',
                        views: 5,
                        $identifying_fields: ['title'],
                    },
                },
            ]

            const result = get_update_ast(
                mutation_pieces,
                0,
                new Map(),
                global_test_schema
            )

            const goal = {
                $update: 'posts',
                $set: [['views', 5]],
                $where: { $eq: ['title', "'john'"] },
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles compound primary key', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['post_has_categories', 0],
                    record: {
                        $operation: 'update',
                        category_id: 2,
                        main_category: 1,
                        post_id: 1,
                        $identifying_fields: ['post_id', 'category_id'],
                    },
                },
            ]

            const result = get_update_ast(
                mutation_pieces,
                0,
                new Map(),
                global_test_schema
            )

            const goal = {
                $update: 'post_has_categories',
                $set: [['main_category', 1]],
                $where: {
                    $eq: [
                        ['post_id', 'category_id'],
                        [1, 2],
                    ],
                },
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles guid resolving for updates', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'update',
                        id: { $guid: 'a' },
                        email: 'a@a.com',
                        $identifying_fields: ['email'],
                    },
                },
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'update',
                        id: 1,
                        user_id: { $guid: 'a' },
                        $identifying_fields: ['id'],
                    },
                },
            ]

            const guid_map = apply_guid_plan_macro(mutation_pieces, [
                { start_index: 0, end_index: 1 },
                { start_index: 1, end_index: 2 },
            ])

            mutation_pieces[0].record.id.$resolved_value = 12

            const result = get_update_ast(
                mutation_pieces,
                1,
                guid_map,
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
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'update',
                        id: 1,
                        $identifying_fields: ['id'],
                    },
                },
            ]

            const result = get_update_ast(
                mutation_pieces,
                0,
                new Map(),
                global_test_schema
            )

            const goal = undefined

            expect(result).to.deep.equal(goal)
        })
    })
    describe(get_delete_ast.name, () => {
        // alot of the logic is shared between update and delete functions, so we dont need to repeat all
        // the tests that we already did with the update function
        test('batches deletes', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'delete',
                        id: 4,
                        $identifying_fields: ['id'],
                    },
                },
                {
                    path: ['posts', 1],
                    record: {
                        $operation: 'delete',
                        id: 5,
                        $identifying_fields: ['id'],
                    },
                },
            ]

            const result = get_delete_ast(
                global_test_schema,
                mutation_pieces,
                mutation_pieces.map((_, i) => i),
                'posts',
                new Map()
            )

            const goal = {
                $delete_from: 'posts',
                $where: { $in: ['id', [4, 5]] },
            }

            expect(result).to.deep.equal(goal)
        })
    })
    describe(get_create_ast.name, () => {
        test('batches creates', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: { $operation: 'create', id: 1, user_id: 11 },
                },
                {
                    path: ['posts', 1],
                    record: { $operation: 'create', id: 2, user_id: 22 },
                },
            ]

            const result = get_create_ast(
                mutation_pieces,
                new Map(),
                [0, 1],
                'posts',
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
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: { $operation: 'create' },
                },
            ]

            const result = get_create_ast(
                mutation_pieces,
                new Map(),
                [0],
                'posts',
                global_test_schema
            )

            const goal = {
                $insert_into: ['posts', []],
                $values: [[]],
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles guid resolving for creates', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'create',
                        email: 'a@a.com',
                        id: { $guid: 'a' },
                    },
                },
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'create',
                        title: 'test',
                        user_id: { $guid: 'a' },
                    },
                },
            ]

            const guid_map = apply_guid_plan_macro(mutation_pieces, [
                { start_index: 0, end_index: 1 },
                { start_index: 1, end_index: 2 },
            ])

            mutation_pieces[0].record.id.$resolved_value = 12

            const result = get_create_ast(
                mutation_pieces,
                guid_map,
                [1],
                'posts',
                global_test_schema
            )

            const goal = {
                $insert_into: ['posts', ['title', 'user_id']],
                $values: [["'test'", 12]],
            }

            expect(result).to.deep.equal(goal)
        })
        test('handles adding default values', () => {
            // in this test, views 0 added since it is the default. SQLite doesn't have a way to say
            // 'use the default value', so orma just puts it in manually. Note that this
            // doesn't work for auto increment, since orma doesn't know what the next
            // auto increment number is.
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'create',
                        title: 'title 1',
                        user_id: 1,
                        views: 1,
                    },
                },
                {
                    path: ['posts', 1],
                    record: {
                        $operation: 'create',
                        title: 'title 2',
                        user_id: 1,
                    },
                },
            ]

            const result = get_create_ast(
                mutation_pieces,
                new Map(),
                [0, 1],
                'posts',
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
