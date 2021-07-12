import { toposort, countInDegrees } from "./toposort"
import { expect } from 'chai'
import { describe, it } from 'mocha'

describe('toposort', () => {
    it('toposorts an empty graph', () => {
        expect(toposort({})).to.deep.equal([])
    })

    it('toposorts a simple DAG', () => {
        expect(
            toposort({
                a: ['b'],
                b: ['c'],
                c: [],
            })
        ).to.deep.equal([['a'], ['b'], ['c']])
    })

    it('toposorts a richer DAG', () => {
        expect(
            toposort({
                a: ['c'],
                b: ['c'],
                c: [],
            })
        ).to.deep.equal([['a', 'b'], ['c']])
    })

    it('toposorts a complex DAG', () => {
        const result = toposort({
            a: ['c', 'f'],
            b: ['d', 'e'],
            c: ['f'],
            d: ['f', 'g'],
            e: ['h'],
            f: ['i'],
            g: ['j'],
            h: ['j'],
            i: [],
            j: [],
        })
        expect(
            result
        ).to.deep.equal([
            ['a', 'b'],
            ['c', 'd', 'e'],
            ['f', 'g', 'h'],
            ['i', 'j'],
        ])
    })

    it('errors on a small cyclic graph', () => {
        const dg = {
            a: ['b'],
            b: ['a'],
            c: [],
        }
        const sortCyclicGraph = () => {
            toposort(dg)
        }
        expect(sortCyclicGraph).to.throw(Error)
    })

    it('errors on a larger cyclic graph', () => {
        const dg = {
            a: ['b', 'c'],
            b: ['c'],
            c: ['d', 'e'],
            d: ['b'],
            e: [],
        }
        const sortCyclicGraph = () => {
            toposort(dg)
        }
        expect(sortCyclicGraph).to.throw(Error)
    })
    it('counts in-degrees for an empty DAG', () => {
        const DAG = {}
        expect(countInDegrees(DAG)).to.deep.equal({})
    })

    it('counts in-degrees for a small DAG', () => {
        const DAG = {
            a: ['b'],
            b: [],
        }
        expect(countInDegrees(DAG)).to.deep.equal({
            a: 0,
            b: 1,
        })
    })

    it('counts in-degrees for a medium DAG', () => {
        const DAG = {
            a: ['b', 'c'],
            b: ['c'],
            c: [],
            d: [],
        }
        expect(countInDegrees(DAG)).to.deep.equal({
            a: 0,
            b: 1,
            c: 2,
            d: 0,
        })
    })

    it('counts in-degrees for a bigger DAG', () => {
        const DAG = {
            a: ['c', 'f'], // `a` is a dependency of `c` and `f`
            b: ['d', 'e'],
            c: ['f'],
            d: ['f', 'g'],
            e: ['h'],
            f: ['i'],
            g: ['j'],
            h: ['j'],
            i: [],
            j: [],
        }
        expect(countInDegrees(DAG)).to.deep.equal({
            a: 0,
            b: 0,
            c: 1,
            d: 1,
            e: 1,
            f: 3,
            g: 1,
            h: 1,
            i: 1,
            j: 2,
        })
    })

})





