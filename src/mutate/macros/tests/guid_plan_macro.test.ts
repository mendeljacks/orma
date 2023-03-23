import { expect } from 'chai'
import { describe, test } from 'mocha'
import { apply_guid_plan_macro } from '../guid_plan_macro'

describe('guid_plan_macro.ts', () => {
    describe(apply_guid_plan_macro.name, () => {
        test('handles multiple different guids', () => {
            const mutation_pieces = [
                { record: { id: { $guid: 'a' }, title: 'a' } },
                { record: { id: { $guid: 'b' } } },
                { record: { post_id: { $guid: 'a' } } },
                { record: { post_id: { $guid: 'b' } }, views: 1 },
            ]

            const mutation_batches = [
                { start_index: 0, end_index: 2 },
                { start_index: 2, end_index: 4 },
            ]

            apply_guid_plan_macro(mutation_pieces, mutation_batches)

            expect(mutation_pieces).to.deep.equal([
                { record: { id: { $guid: 'a', $write: true }, title: 'a' } },
                { record: { id: { $guid: 'b', $write: true } } },
                { record: { post_id: { $guid: 'a', $read: true } } },
                { record: { post_id: { $guid: 'b', $read: true } }, views: 1 },
            ])
        })
        test('handles multiple of the same guid', () => {
            const mutation_pieces = [
                { record: { id: { $guid: 'a' }, title: 'a' } },
                { record: { id: { $guid: 'a' } } },
                { record: { post_id: { $guid: 'a' } } },
                { record: { post_id: { $guid: 'a' } }, views: 1 },
            ]

            const mutation_batches = [
                { start_index: 0, end_index: 2 },
                { start_index: 2, end_index: 4 },
            ]

            apply_guid_plan_macro(mutation_pieces, mutation_batches)

            expect(mutation_pieces).to.deep.equal([
                { record: { id: { $guid: 'a', $write: true }, title: 'a' } },
                { record: { id: { $guid: 'a', $write: true } } },
                { record: { post_id: { $guid: 'a', $read: true } } },
                { record: { post_id: { $guid: 'a', $read: true } }, views: 1 },
            ])
        })
        test('handles no guids', () => {
            const mutation_pieces = [{ record: { title: 'a' } }]

            const mutation_batches = [{ start_index: 0, end_index: 1 }]

            apply_guid_plan_macro(mutation_pieces, mutation_batches)

            expect(mutation_pieces).to.deep.equal([{ record: { title: 'a' } }])
        })
        test('differentiates numbers and number strings', () => {
            const mutation_pieces = [
                { record: { id: { $guid: '1' } } },
                // 1 is different to '1', so this guid is a write not a read
                { record: { post_id: { $guid: 1 } } },
            ]

            const mutation_batches = [
                { start_index: 0, end_index: 1 },
                { start_index: 1, end_index: 2 },
            ]

            apply_guid_plan_macro(mutation_pieces, mutation_batches)

            expect(mutation_pieces).to.deep.equal([
                { record: { id: { $guid: '1', $write: true } } },
                { record: { post_id: { $guid: 1 }, $write: true } },
            ])
        })
    })
})
