import { expect } from 'chai'
import { describe, test } from 'mocha'
import {
    apply_inherit_operations_macro,
    InheritOperationMacroInput,
} from '../inherit_operations_macro'

describe('inherit_operations_macro', () => {
    describe(apply_inherit_operations_macro.name, () => {
        test('propagates operations', () => {
            const mutation_pieces: InheritOperationMacroInput = [
                {
                    record: { title: 'hi' },
                    path: ['products', 0],
                    lower_indices: [1],
                },
                {
                    record: { url: 'www.test.com/image' },
                    path: ['products', 0, 'images', 0],
                    higher_index: 0,
                    lower_indices: [],
                },
            ]

            apply_inherit_operations_macro(mutation_pieces, 'create')

            expect(
                mutation_pieces.map(el => el.record.$operation)
            ).to.deep.equal(['create', 'create'])
        })
        test('respects operation changes', () => {
            const mutation_pieces: InheritOperationMacroInput = [
                {
                    record: { $operation: 'update', id: 1, title: 'hi' },
                    path: ['products', 0],
                    lower_indices: [1],
                },
                {
                    record: { id: 1, url: 'www.test.com/image' },
                    path: ['products', 0, 'images', 0],
                    higher_index: 0,
                    lower_indices: [],
                },
            ]

            apply_inherit_operations_macro(mutation_pieces, 'create')

            expect(
                mutation_pieces.map(el => el.record.$operation)
            ).to.deep.equal(['update', 'update'])
        })
        test('handles undefined operation', () => {
            const mutation_pieces: InheritOperationMacroInput = [
                {
                    record: { $operation: 'create', title: 'hi' },
                    path: ['products', 0],
                    lower_indices: [],
                },
            ]

            apply_inherit_operations_macro(mutation_pieces, undefined)

            expect(
                mutation_pieces.map(el => el.record.$operation)
            ).to.deep.equal(['create'])
        })
    })
})
