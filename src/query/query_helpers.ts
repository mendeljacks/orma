import { orma_escape } from '../helpers/escape'
import { deep_get, is_simple_object, last } from '../helpers/helpers'
import { is_reserved_keyword } from '../helpers/schema_helpers'
import { path_to_table } from '../mutate/helpers/mutate_helpers'
import { PathedRecord } from '../types'
import { OrmaSchema } from '../schema/schema_types'

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
 * Calls the processor on every table in a query. Does a breadth first search which processes the less nested
 * tables before the more nested ones.
 */
export const query_for_each = (
    query: Record<string, any>,
    processor: (value: any, path: string[], table_name: string) => void,
    current_path: string[] = []
) => {
    const root_paths = Object.keys(query)
        .filter(el => !is_reserved_keyword(el) && is_subquery(query[el]))
        .map(key => [key])
    const queue = root_paths

    while (queue.length > 0) {
        const path = queue.shift() as string[]
        const subquery = deep_get(path, query)
        const subquery_keys = Object.keys(subquery).filter(
            key => !is_reserved_keyword(key) && is_subquery(subquery[key])
        )
        const subquery_paths = subquery_keys.map(key => [...path, key])
        queue.push(...subquery_paths)

        if (path.length > 0) {
            // dont call processor on query root, since this doesnt correspond with an table
            const table_name = subquery.$from ?? last(path)
            processor(subquery, path, table_name)
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
    where_clauses: (Record<string, any> | undefined)[],
    connective: '$and' | '$or'
) => {
    const combined_where = where_clauses
        .filter(el => el !== undefined)
        .reduce((combined_where, new_where) => {
            if (combined_where === undefined) {
                return new_where
            }

            const wheres: any[] = new_where?.[connective] ?? [new_where]
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
    pathed_records: PathedRecord[], // Record<string, any>[],
    get_search_columns: (record: Record<string, any>) => string[],
    orma_schema: OrmaSchema
) => {
    const pathed_records_by_search_columns = pathed_records.reduce(
        (acc, path_record) => {
            const identifying_columns = get_search_columns(path_record.record)
            if (identifying_columns.length === 0) {
                throw new Error("Can't find identifying columns for record")
            }
            const key = JSON.stringify(identifying_columns)
            if (!acc[key]) {
                acc[key] = []
            }

            acc[key].push(path_record)
            return acc
        },
        {}
    )

    const ors = Object.keys(pathed_records_by_search_columns).flatMap(key => {
        const identifying_columns = JSON.parse(key)
        const pathed_records = pathed_records_by_search_columns[key]
        if (identifying_columns.length === 1) {
            const column = identifying_columns[0]
            return {
                $in: [
                    column,
                    pathed_records.map(({ record, path }) => {
                        const table = path_to_table(path)
                        return orma_escape(
                            record[column],
                            orma_schema.tables[table].database_type
                        )
                    }),
                ],
            }
        } else {
            // 2 or more, e.g. combo unique
            // generate an or per record and an and per identifying column
            return pathed_records.map(({ path, record }) => ({
                $and: identifying_columns.map(column => ({
                    $eq: [
                        column,
                        orma_escape(
                            record[column],
                            orma_schema.tables[path_to_table(path)]
                                .database_type
                        ),
                    ],
                })),
            }))
        }
    })

    const where = combine_wheres(ors, '$or')

    return where
}
