import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../../test_data/global_test_schema'
import { MutationPiece } from '../../plan/mutation_plan'
import {
    apply_infer_identifying_fields_macro,
    get_identifying_fields,
    get_possible_identifying_keys,
    InferIdentifyingFieldsInput,
} from '../identifying_fields_macro'

describe('identifying_keys.ts', () => {
    describe(apply_infer_identifying_fields_macro.name, () => {
        test('uses resolved $guid fields as identifying keys', () => {
            const mutation_pieces: InferIdentifyingFieldsInput = [
                {
                    record: {
                        $operation: 'update',
                        user_id: { $read_guid: 1 },
                        post_id: { $read_guid: 2 },
                    },
                    path: ['likes', 0],
                },
            ]

            apply_infer_identifying_fields_macro(
                global_test_schema,
                mutation_pieces
            )

            expect(mutation_pieces[0].record.$identifying_fields).to.deep.equal(
                ['user_id', 'post_id']
            )
        })
        test('will not use fields that have null as their value', () => {
            const mutation_pieces: InferIdentifyingFieldsInput = [
                {
                    record: {
                        $operation: 'update',
                        title: null,
                    },
                    path: ['posts', 0],
                },
            ]

            apply_infer_identifying_fields_macro(
                global_test_schema,
                mutation_pieces
            )

            expect(mutation_pieces[0].record.$identifying_fields).to.deep.equal(
                []
            )
        })
        test('allows nullable unique fields, as long as the record value is not null', () => {
            const mutation_pieces: InferIdentifyingFieldsInput = [
                {
                    record: {
                        $operation: 'update',
                        title: 'test',
                    },
                    path: ['posts', 0],
                },
            ]

            apply_infer_identifying_fields_macro(
                global_test_schema,
                mutation_pieces
            )

            expect(mutation_pieces[0].record.$identifying_fields).to.deep.equal(
                ['title']
            )
        })
        test('ignores $write $guid fields', () => {
            const mutation_pieces: InferIdentifyingFieldsInput = [
                {
                    record: {
                        $operation: 'update',
                        id: { $guid: '1234', $write: true },
                        title: 'test',
                    },
                    path: ['posts', 0],
                },
            ]

            apply_infer_identifying_fields_macro(
                global_test_schema,
                mutation_pieces
            )

            expect(mutation_pieces[0].record.$identifying_fields).to.deep.equal(
                ['title']
            )
        })
        test('ignores creates', () => {
            const mutation_pieces: InferIdentifyingFieldsInput = [
                {
                    record: {
                        $operation: 'create',
                        id: 21,
                        title: 'test',
                    },
                    path: ['posts', 0],
                },
            ]

            apply_infer_identifying_fields_macro(
                global_test_schema,
                mutation_pieces
            )

            expect(mutation_pieces[0].record.$identifying_fields).to.deep.equal(
                undefined
            )
        })
        test('throws on no identifying key', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['posts', 0],
                    record: {
                        $operation: 'update',
                        views: 5, // views is not unique, so it can't be used to update with
                        $identifying_fields: [],
                    },
                },
            ]
            try {
                apply_infer_identifying_fields_macro(
                    global_test_schema,
                    mutation_pieces
                )
                expect('should have thrown an error').to.equal(true)
            } catch (error) {
                // error was thrown as it should be
            }
        })
        test('throws on multiple unique update keys', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        $operation: 'update',
                        billing_address_id: 1,
                        email: 'a@a.com',
                        first_name: 'john',
                        last_name: 'smith',
                    },
                },
            ]
            try {
                apply_infer_identifying_fields_macro(
                    global_test_schema,
                    mutation_pieces
                )
                expect('should have thrown an error').to.equal(true)
            } catch (error) {}
        })
    })
    describe(get_identifying_fields.name, () => {
        test('chooses an ambiguous key if desired', () => {
            const record: Record<string, any> = {
                $operation: 'update',
                first_name: 'Charlie',
                last_name: 'Coal',
                email: 'char@coal.com',
            }

            const fields = get_identifying_fields(
                global_test_schema,
                'users',
                record,
                true
            )

            expect(fields).to.deep.equal(['email'])
        })
    })
    describe(get_possible_identifying_keys.name, () => {
        test('includes nullable unique keys', () => {
            const result = get_possible_identifying_keys(
                global_test_schema,
                'posts'
            )
            expect(result).to.deep.equal([['id'], ['title']])
        })
    })
})
