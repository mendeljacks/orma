import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../../helpers/tests/global_test_schema'
import {
    apply_infer_identifying_fields_macro,
    get_identifying_fields,
    get_possible_identifying_keys,
    InferIdentifyingFieldsInput,
} from '../identifying_fields_macro'

describe.only('identifying_keys.ts', () => {
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
        test('ignores $write_guid fields', () => {
            const mutation_pieces: InferIdentifyingFieldsInput = [
                {
                    record: {
                        $operation: 'update',
                        id: { $write_guid: '1234' },
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
