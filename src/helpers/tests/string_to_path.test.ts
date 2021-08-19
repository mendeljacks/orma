import { path_to_string, string_to_path } from '../string_to_path'
import { test } from 'mocha'
import { expect } from 'chai'

describe(string_to_path.name, () => {
    test('can stringify and parse', () => {
        expect(string_to_path(path_to_string(1))).to.deep.equal(1)
        expect(string_to_path(path_to_string(['test.0']))).to.deep.equal(['test.0'])
        expect(string_to_path(path_to_string([1, 2, 'test.0']))).to.deep.equal([1, 2, 'test.0'])
        expect(string_to_path(path_to_string(false))).to.deep.equal(false)
        expect(string_to_path(path_to_string(true))).to.deep.equal(true)
        expect(string_to_path(path_to_string(null))).to.deep.equal(null)
        expect(string_to_path(path_to_string('null'))).to.deep.equal('null')
        // expect(string_to_path(path_to_string(undefined))).to.deep.equal(undefined)
        // expect(string_to_path(path_to_string(Infinity))).to.deep.equal(Infinity)
    })
})
