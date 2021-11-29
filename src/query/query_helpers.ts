import { deep_get } from '../helpers/helpers'
import { is_reserved_keyword } from '../helpers/schema_helpers'

/**
 * Returns true if the parameter is a subquery. A subquery is an object that has at least one data fetching prop
 * (i.e. a prop that doesnt start with a $) or is an empty object.
 * @param subquery
 * @returns
 */
export const is_subquery = (subquery: any) => {
    const is_object = typeof subquery === 'object' && !Array.isArray(subquery)
    if (!is_object) {
        return false
    }

    const subquery_keys = Object.keys(subquery)
    const has_data_prop = subquery_keys.some(key => !is_reserved_keyword(key))

    return has_data_prop || subquery_keys.length === 0
}

/**
 * Calls the processor on every entity in a query. Does a breadth first search which processes the less nested
 * entities before the more nested ones.
 */
export const query_for_each = (
    query: Record<string, any>,
    processor: (value: any, path: string[]) => void,
    current_path: string[] = []
) => {
    const root_paths = Object.keys(query).map(key => [key])
    const queue = root_paths

    while (queue.length > 0) {
        const path = queue.shift()
        const subquery = deep_get(path, query)
        const subquery_keys = Object.keys(subquery).filter(
            key => is_subquery(subquery[key]) && !is_reserved_keyword(key)
        )
        const subquery_paths = subquery_keys.map(key => [...path, key])
        queue.push(...subquery_paths)

        if (path.length > 0) {
            // dont call processor on query root, since this doesnt correspond with an entity
            processor(subquery, path)
        }
    }
}

/**
 * Joins the given where clauses into a new where clause, using the connective if there is more than one where clause provided.
 * Collapses the connective prop so the end where clause doesnt have nested connectives such as
 * {
 *   $or: [{
 *     $or: { ...where_clause }
 *   }]
 * }
 */
export const combine_wheres = (
    where_clauses: Record<string, any>[],
    connective: '$and' | '$or'
) => {
    const combined_where = where_clauses
        .filter(el => el !== undefined)
        .reduce((combined_where, where_clause) => {
            if (combined_where === undefined) {
                return where_clause
            }

            const wheres: any[] = where_clause[connective] ?? [where_clause]
            if (!combined_where[connective]) {
                return {
                    [connective]: [combined_where, ...wheres],
                }
            } else {
                combined_where[connective].push(...wheres)
                return combined_where
            }
        }, undefined)

    return combined_where
}
