import { expect } from "chai"
import { describe, test } from "mocha"
import { push_path } from "../push_path"

describe('push_path', () => {
    test('Creates [] when nothing at path', () => {

        let obj = { my: { nested: {} } }
        push_path(['my', 'nested', 'arr'], 'my_val', obj)
        expect(obj).to.deep.equal({ my: { nested: {arr: ['my_val']} } })
    })
    test('Pushes to array when something is at path', () => {
        let obj = { my: { nested: { arr: [1]} } }
        push_path(['my', 'nested', 'arr'], 2, obj)
        expect(obj).to.deep.equal({ my: { nested: {arr: [1,2]} } })

    })
})