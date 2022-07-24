import { clone, deep_get, drop_last, last } from '../helpers/helpers'
import { nester } from '../helpers/nester'
import { get_direct_edge } from '../helpers/schema_helpers'
import { OrmaSchema } from '../introspector/introspector'
import { mysql_fn } from '../mutate/mutate'
import { generate_statement } from '../mutate/statement_generation/mutation_statements'
import { QueryResult } from '../types/query/query_result_types'
import { OrmaQuery } from '../types/query/query_types'
import { DeepReadonly } from '../types/schema_types'
import { apply_any_path_macro } from './macros/any_path_macro'
import { apply_escape_macro } from './macros/escaping_macros'
import {
    apply_nesting_macro,
    should_nesting_short_circuit,
} from './macros/nesting_macro'
import { apply_select_macro } from './macros/select_macro'
import { get_query_plan } from './query_plan'

// This function will default to the from clause
export const get_real_higher_entity_name = (
    path: (string | number)[],
    query
) => {
    if (path.length < 2) return null

    return (
        deep_get([...drop_last(1, path), '$from'], query, null) ||
        path[path.length - 2]
    )
}

// This function will default to the from clause
export const get_real_entity_name = (
    last_path_item: string,
    subquery: Record<string, any>
): string => {
    return subquery.$from ?? last_path_item
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
    orma_schema: OrmaSchema
) => {
    const subquery = deep_get(subquery_path, query)
    const $having = subquery.$having

    return $having
}

export const orma_nester = (
    results: [string[], Record<string, unknown>[]][],
    query,
    orma_schema: OrmaSchema
) => {
    // get data in the right format for the nester
    const edges = results.map(result => {
        const path = result[0]
        if (path.length === 1) {
            return null
        }
        const higher_entity_path = path.slice(0, -1)
        const higher_entity = deep_get(higher_entity_path, query)
        const entity = higher_entity[last(path)]
        const entity_name = get_real_entity_name(last(path), entity)
        const higher_entity_name = get_real_entity_name(
            last(higher_entity_path),
            higher_entity
        )
        const edge = get_direct_edge(
            higher_entity_name,
            entity_name,
            orma_schema,
            entity.$foreign_key
        )
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
export const orma_query = async <
    Schema extends OrmaSchema,
    Query extends OrmaQuery<Schema>
>(
    raw_query: Query,
    orma_schema_input: Schema,
    query_function: mysql_fn
): Promise<QueryResult<Schema, Query>> => {
    const query = clone(raw_query) // clone query so we can apply macros without mutating the actual input query
    const orma_schema = orma_schema_input as any // this is just because the codebase isnt properly typed

    // simple macros
    apply_any_path_macro(query, orma_schema)
    apply_select_macro(query, orma_schema)

    const query_plan = get_query_plan(query)
    let results: any[] = []

    // Sequential for query plan
    for (const paths of query_plan) {
        const subqueries = paths
            .map(path => {
                // this pretty inefficient, but nesting macro gets confused when it sees the where clauses
                // that it put in the query and thinks that they were there before mutation planning.
                // The data about tier results should really come from the mutation plan and not from
                // the (mutated) query. But this works for now.
                const tier_query = clone(query)

                // if this query wont return anything due to there being no higher rows, then skip it
                if (should_nesting_short_circuit(tier_query, path, results)) {
                    return undefined
                }
                // the nesting macro needs previous results, so we cant do it in the beginning
                apply_nesting_macro(tier_query, path, results, orma_schema)

                const subquery = deep_get(path, tier_query)
                apply_escape_macro(subquery)

                return subquery
            })
            .filter(el => el !== undefined)

        // Promise.all for each element in query plan.
        // dont call query is there are no sql strings to run
        const output =
            subqueries.length > 0
                ? await query_function(
                      subqueries.map(subquery =>
                          generate_statement(subquery, [])
                      )
                  )
                : []

        // Combine outputs
        subqueries.forEach((_, i) => results.push([paths[i], output[i]]))
    }

    const output = orma_nester(results, query, orma_schema)

    return output as any
}

export const as_orma_schema = <Schema extends OrmaSchema>(schema: Schema) =>
    schema

export const as_orma_query = <
    Schema extends OrmaSchema,
    T extends DeepReadonly<OrmaQuery<Schema>>
>(
    schema: Schema,
    query: T
): T => query

// export const as_orma_query_result = <Schema extends OrmaSchema, Query extends OrmaQuery<Schema>>(orma_schema: Schema, query: Query): QueryResult =>
