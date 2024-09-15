/**
 * This file creates query plans for use in orma queries. A query plan specifies which tables need to be queried,
 * and in what order they should be queries, and which tables can be queries concurrently.
 *
 * @module query_plan
 */

import { deep_get, last } from '../helpers/helpers'
import { query_for_each } from './query_helpers'

/**
 * Generates a query plan for a given query. The query plan is a list of query tiers, where each tier represents
 * a set of tables that can be queries concurrently. A query tier is just an array of paths, where each path
 * represents one table in the query.
 */
export const get_query_plan = (query): string[][][] => {
    /**
     * The query plan is created by recording tables by a breadth first search of the query tree. This means
     * for any table, the table above it in the query will either be in the same tier or a previous tier. A lower
     * table will be put in a later tier rather than the same one as a higher table if it has a where or having clause.
     * This is because we dont want to duplicate the where / having clause by doing a server side join between the
     * tables which would require the where clause on the higher table to be on both the higher and lower tables.
     * Instead, we do the queries in sequence, which lets us cache the ids of the higher table and search the lower
     * table directly on those ids instead of repeating the where clause.
     */
    const query_plan: string[][][] = [[]]
    const tier_by_path: Record<string, number> = {}
    query_for_each(query, (value, path) => {
        // we create a new tier for 2 reasons:
        //   1. Table is directly below a root table and there is only one tier in the query plan.
        //      In this case we need to query the root tables first so that we have some ancestor ids to search from.
        //
        //   2. Table directly above has a where or having clause, as explained previously. Note that if this table is
        //      also the root, then it goes in its own tier since its the first table queried, so there is no need to
        //      add a tier)

        const parent_path = path.slice(0, path.length - 1)
        const parent_tier =
            parent_path.length > 0
                ? tier_by_path[JSON.stringify(parent_path)]
                : undefined
        const parent_value = deep_get(parent_path, query)
        const parent_has_filter = parent_value.$where || parent_value.$having

        const tier = get_tier(path.length, parent_tier, parent_has_filter)

        if (tier >= query_plan.length) {
            query_plan.push([])
        }

        tier_by_path[JSON.stringify(path)] = tier
        last(query_plan).push(path)
    })

    return query_plan
}

const get_tier = (
    path_length: number,
    parent_tier: number | undefined,
    parent_has_filter: boolean
) => {
    // root level subqueries (path_length == 1) go in tier 0, and tables directly below the root
    // (path_length == 2) go in tier 1
    if (path_length <= 2 || parent_tier === undefined) {
        return path_length - 1
    }

    // go in the next tier if the parent has a where or having clause
    return parent_has_filter ? parent_tier + 1 : parent_tier
}
