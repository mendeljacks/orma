type ToposortGenericType<T extends string | number> = (
    dag: Record<T, T[]>
) => T[][]

/**
 * Topological sorting is a graph algorithm to sort by dependencies
 * Operational complexity O(n)
 * Spacial complexity O(n)
 * Based on Kahn's algorithm with batching support.
 * Dont mix string and numbers together in the dag, to prevent bugs due to javascript objects auto-converting the \
 * number 1 to '1'
 * @param dag A directed acyclic graph
 */
export const toposort: ToposortGenericType<string> &
    ToposortGenericType<number> = dag => {
    const indegrees = countInDegrees(dag)
    const sorted: any[] = []

    let roots = getRoots(indegrees)

    while (roots.length) {
        sorted.push(roots)

        const newRoots: any[] = []
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
