import { escape } from 'sqlstring'
import { orma_escape } from '../helpers/escape'
import { deep_get, is_simple_object, last } from '../helpers/helpers'
import { is_reserved_keyword } from '../helpers/schema_helpers'

/**
 * Returns true if the parameter is a subquery. A subquery is an object that has at least one data fetching prop
 * (i.e. a prop that doesnt start with a $), is an empty object, or has a $from keyword as a property.
 * @param subquery
 * @returns
 */
export const is_subquery = (subquery: any) => {
    const is_object = is_simple_object(subquery)
    if (!is_object) {
        return false
    }

    const subquery_keys = Object.keys(subquery)
    const has_data_prop = subquery_keys.some(key => !is_reserved_keyword(key))
    const has_from = subquery.$from !== undefined
    const is_empty = subquery_keys.length === 0

    return has_data_prop || has_from || is_empty
}

/**
 * Calls the processor on every entity in a query. Does a breadth first search which processes the less nested
 * entities before the more nested ones.
 */
export const query_for_each = (
    query: Record<string, any>,
    processor: (value: any, path: string[], entity_name: string) => void,
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
            const entity_name = subquery.$from ?? last(path)
            processor(subquery, path, entity_name)
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

export const get_search_records_where = (
    records: Record<string, any>[],
    get_search_fields: (record: Record<string, any>) => string[]
) => {
    const records_by_search_fields = records.reduce((acc, record) => {
        const identifying_fields = get_search_fields(record)
        if (identifying_fields.length === 0) {
            throw new Error('Can\'t find identifying fields for record')
        }
        const key = JSON.stringify(identifying_fields)
        if (!acc[key]) {
            acc[key] = []
        }

        acc[key].push(record)
        return acc
    }, {})

    const ors = Object.keys(records_by_search_fields).flatMap(key => {
        const identifying_fields = JSON.parse(key)
        const records = records_by_search_fields[key]
        if (identifying_fields.length === 1) {
            const field = identifying_fields[0]
            return {
                $in: [
                    field,
                    records.map(record => orma_escape(record[field])),
                ],
            }
        } else {
            // 2 or more, e.g. combo unique
            // generate an or per record and an and per identifying field
            return records.map(record => ({
                $and: identifying_fields.map(field => ({
                    $eq: [field, orma_escape(record[field])],
                })),
            }))
        }
    })

    const where = combine_wheres(ors, '$or')

    return where
}
