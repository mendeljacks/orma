import { expect } from 'chai'
import { describe, test } from 'mocha'
import { apply_guid_plan_macro } from '../../macros/guid_plan_macro'
import { MutationPiece } from '../../plan/mutation_plan'
import { replace_guids_with_values } from '../guid_processing'

describe('guid_processing.ts', () => {
    describe(replace_guids_with_values.name, () => {
        test('replaces guids', () => {
            const mutation_pieces: MutationPiece[] = [
                {
                    path: ['users', 0],
                    record: {
                        id: { $guid: 'a' },
                        email: 'a@a.com',
                        $operation: 'update',
                    },
                },
                {
                    path: ['posts', 1],
                    record: {
                        user_id: { $guid: 'a' },
                        title: 'my title',
                        $operation: 'create',
                    },
                },
            ]

            const guid_map = apply_guid_plan_macro(mutation_pieces, [
                { start_index: 0, end_index: 1 },
                { start_index: 1, end_index: 2 },
            ])

            mutation_pieces[0].record.id.$resolved_value = 1

            replace_guids_with_values(mutation_pieces, guid_map)

            expect(mutation_pieces[0].record.id).to.equal(1)
            expect(mutation_pieces[1].record.user_id).to.equal(1)
        })
    })
})
