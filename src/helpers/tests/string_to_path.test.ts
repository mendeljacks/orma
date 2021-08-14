import { path_to_string, string_to_path } from '../string_to_path'
import { test } from 'mocha'
import { expect } from 'chai'

describe(string_to_path.name, () => {
    test('can stringify and parse', () => {
        expect(string_to_path(path_to_string(1))).toEqual(1)
        expect(string_to_path(path_to_string(['test.0']))).toEqual(['test.0'])
        expect(string_to_path(path_to_string([1, 2, 'test.0']))).toEqual([1, 2, 'test.0'])
        expect(string_to_path(path_to_string(Infinity))).toEqual(Infinity)
        expect(string_to_path(path_to_string(false))).toEqual(false)
        expect(string_to_path(path_to_string(true))).toEqual(true)
        expect(string_to_path(path_to_string(null))).toEqual(null)
        expect(string_to_path(path_to_string('null'))).toEqual('null')
        expect(string_to_path(path_to_string(undefined))).toEqual(undefined)
    })
})
