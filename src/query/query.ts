import { clone, deep_get, deep_set, drop_last, last } from '../helpers/helpers'
import { nester } from '../helpers/nester'
import { get_direct_edge, is_reserved_keyword } from '../helpers/schema_helpers'
import { orma_schema } from '../introspector/introspector'
import { ExpandRecursively } from '../types/helper_types'
import { QueryResult } from '../types/query/query_result_types'
import { OrmaQuery } from '../types/query/query_types'
import { DeepReadonly, DeepReadonlyObject, OrmaSchema } from '../types/schema_types'
import { json_to_sql } from './json_sql'
import { apply_any_path_macro } from './macros/any_path_macro'
import { apply_escape_macro } from './macros/escaping_macros'
import { apply_nesting_macro } from './macros/nesting_macro'
import { apply_select_macro } from './macros/select_macro'
import { get_query_plan } from './query_plan'

// This function will default to the from clause
export const get_real_parent_name = (path: (string | number)[], query) => {
    if (path.length < 2) return null

    return deep_get([...drop_last(1, path), '$from'], query, null) || path[path.length - 2]
}

// This function will default to the from clause
export const get_real_entity_name = (path: (string | number)[], query) => {
    return deep_get([...path, '$from'], query, null) || last(path)
}

// export const get_subquery_sql = (
//     query,
//     subquery_path: string[],
//     previous_results: (string[] | Record<string, unknown>[])[][],
//     orma_schema: orma_schema
// ): string => {
//     const json_sql = query_to_json_sql(query, subquery_path, previous_results, orma_schema)
//     const sql = json_to_sql(json_sql)

//     return sql
// }

// /**
//  * transforms a query into a simplified json sql. This is still json, but can be parsed directly into sql (so no subqueries, $from is always there etc.)
//  */
// export const query_to_json_sql = (
//     query,
//     subquery_path: string[],
//     previous_results: (string[] | Record<string, unknown>[])[][],
//     orma_schema: orma_schema
// ): Record<string, any> => {
//     const subquery = deep_get(subquery_path, query)

//     // strip sub subqueries from the subquery
//     const reserved_commands = Object.keys(subquery).filter(is_reserved_keyword)
//     const reserved_json = reserved_commands.reduce((previous, key) => {
//         return {
//             ...previous,
//             [key]: subquery[key]
//         }
//     }, {})

//     //
//     const $select = select_to_json_sql(query, subquery_path, orma_schema)
//     const $from = subquery.$from ?? last(subquery_path)
//     const $where = where_to_json_sql(query, subquery_path, previous_results, orma_schema)
//     const $having = having_to_json_sql(query, subquery_path, orma_schema)

//     const json_sql: Record<string, unknown> = {
//         ...reserved_json,
//         ...($select && { $select }),
//         ...($from && { $from }),
//         ...($where && { $where }),
//         ...($having && { $having })
//     }

//     return json_sql
// }

export const having_to_json_sql = (
    query: any,
    subquery_path: string[],
    orma_schema: orma_schema
) => {
    const subquery = deep_get(subquery_path, query)
    const $having = subquery.$having

    return $having
}

export const orma_nester = (
    results: [string[], Record<string, unknown>[]][],
    query,
    orma_schema: orma_schema
) => {
    // get data in the right format for the nester
    const edges = results.map(result => {
        const path = result[0]
        if (path.length === 1) {
            return null
        }
        const entity = get_real_entity_name(path,query )
        const higher_entity = get_real_entity_name(path.slice(0, -1), query) 
        const edge = get_direct_edge(higher_entity, entity, orma_schema)
        return [edge.from_field, edge.to_field]
    })

    const data = results.map(result => {
        const path = result[0]
        const rows = result[1]
        return [path.flatMap(path_el => [path_el, 0]), rows] // all array nesting for now
    })

    return nester(data, edges)
}

// export const orma_query = async <schema>(raw_query: validate_query<schema>, orma_schema: validate_orma_schema<schema>, query_function: (sql_string: string) => Promise<Record<string, unknown>[]>) => {
export const orma_query = async <Schema extends OrmaSchema, Query extends OrmaQuery<Schema>>(
    raw_query: Query,
    orma_schema_input: Schema,
    query_function: (sql_string: string[]) => Promise<Record<string, unknown>[][]>,
    escaping_function: (value) => any
): Promise<QueryResult<Schema, Query>> => {
    const query = clone(raw_query) // clone query so we can apply macros without mutating the actual input query
    const orma_schema = orma_schema_input as any // this is just because the codebase isnt properly typed

    apply_any_path_macro(query, orma_schema)
    apply_select_macro(query, orma_schema)

    const query_plan = get_query_plan(query)
    let results = []

    // Sequential for query plan
    for (const paths of query_plan) {
        const sql_strings = paths.map(path => {
            // the nesting macro needs previous results, so we cant do it in the beginning
            apply_nesting_macro(query, path, results, orma_schema)

            const subquery = deep_get(path, query)
            apply_escape_macro(subquery, escaping_function)

            return json_to_sql(subquery)
        })

        // Promise.all for each element in query plan
        const output = await query_function(sql_strings)

        // Combine outputs
        sql_strings.forEach((_, i) => results.push([paths[i], output[i]]))
    }

    const output = orma_nester(results, query, orma_schema)

    return output as any
}

export const as_orma_schema =<Schema extends OrmaSchema>(schema: Schema) => schema
export const as_orma_query = <Schema extends OrmaSchema, T extends OrmaQuery<Schema>>(schema: Schema, query: T): T => (query as T)

// export const as_orma_query_result = <Schema extends OrmaSchema, Query extends OrmaQuery<Schema>>(orma_schema: Schema, query: Query): QueryResult => 