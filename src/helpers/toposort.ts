/**
 * Topological sorting is a graph algorithm to sort by dependencies
 * Operational complexity O(n)
 * Spacial complexity O(n)
 * Based on Kahn's algorithm with batching support
 * @param dag A directed acyclic graph
 */
export const toposort = dag => {
    const indegrees = countInDegrees(dag)
    const sorted = []

    let roots = getRoots(indegrees)

    while (roots.length) {
        sorted.push(roots)

        const newRoots = []
        roots.forEach(root => {
            dag[root].forEach(dependent => {
                indegrees[dependent]--
                if (indegrees[dependent] === 0) {
                    newRoots.push(dependent)
                }
            })
        })

        roots = newRoots
    }

    if (getNonRoots(indegrees).length) {
        throw Error('Cycle(s) detected; toposort only works on acyclic graphs')
    }

    return sorted
}


export const countInDegrees = dag => {
    const counts = {}
    Object.entries(dag).forEach(([vx, dependents]: any) => {
        counts[vx] = counts[vx] || 0
        dependents.forEach(dependent => {
            counts[dependent] = counts[dependent] || 0
            counts[dependent]++
        })
    })
    return counts
}
const filterByDegree = predicate => counts =>
    Object.entries(counts)
        .filter(([_, deg]) => predicate(deg))
        .map(([id, _]) => id)

const getRoots = filterByDegree(deg => deg === 0)

const getNonRoots = filterByDegree(deg => deg !== 0)

