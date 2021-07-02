import { expect } from "chai";
import { describe, test } from "mocha";
import { extract_subpaths } from "./extract_subpaths";

describe('Extract subpaths', () => {
    test('Extracts subpaths from arrays', () => {
        const products = [{
            id: 1,
            title: 'Phone',
            variants: [
                { id: 11, sku: 'phne1' }
            ]
        }, {
            id: 2,
            title: 'Tissue Box',
            variants: [
                { id: 22, sku: 'tssu1-green' },
                { id: 33, sku: 'tssu1-blue' },
                { id: 44, sku: 'tssu1-pink' },
            ]
        }]
        const template_path = [0, 'variants', 0]
        const goal = [
            [0, 'variants', 0],
            [1, 'variants', 0],
            [1, 'variants', 1],
            [1, 'variants', 2],
        ]

        const subpaths = extract_subpaths(template_path, products)

        expect(subpaths).to.deep.equal(goal)
    })
})