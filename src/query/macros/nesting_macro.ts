import { deep_get, last } from '../../helpers/helpers'
import {
    Edge,
    get_direct_edge,
    reverse_edge,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { get_real_entity_name } from '../query'
import { combine_wheres } from '../query_helpers'
import { edge_path_to_where_ins, process_any_clause } from './any_path_macro'

/**
 * Add a where clause which handles only getting records that are connected to previous records. Mutates the input query.
 */
export const apply_nesting_macro = (
    query,
    subquery_path: string[],
    previous_results: (string[] | Record<string, unknown>[])[][],
    orma_schema: OrmaSchema
) => {
    const subquery = deep_get(subquery_path, query)

    const nesting_where = get_nesting_where(
        query,
        subquery_path,
        previous_results,
        orma_schema
    )
    const combined_where = combine_wheres(
        [subquery.$where, nesting_where],
        '$and'
    )
    subquery.$where = combined_where
}

export const should_nesting_short_circuit = (
    query,
    subquery_path: string[],
    previous_results: (string[] | Record<string, unknown>[])[][]
) => {
    const ancestor_rows = get_ancestor_rows(query, subquery_path, previous_results)

    // we dont short circuit if the path length is 1, since there will be results even though there are no ancestor
    // rows (because there is no ancestor on the first nesting layer)
    return ancestor_rows.length === 0 && subquery_path.length > 1
}

export const get_ancestor_rows = (
    query,
    subquery_path: string[],
    previous_results: (string[] | Record<string, unknown>[])[][]
) => {
    const nesting_ancestor_index = get_nesting_ancestor_index(
        query,
        subquery_path
    )
    const ancestor_path = subquery_path.slice(0, nesting_ancestor_index + 1)

    const ancestor_result = previous_results.filter(
        previous_result =>
            previous_result[0].toString() === ancestor_path.toString()
    )[0]

    const ancestor_rows = (ancestor_result?.[1] ?? []) as Record<
        string,
        unknown
    >[]

    return ancestor_rows
}

export const get_nesting_where = (
    query,
    subquery_path: string[],
    previous_results: (string[] | Record<string, unknown>[])[][],
    orma_schema: OrmaSchema
) => {
    const is_root_subquery = subquery_path.length <= 1
    if (is_root_subquery) {
        return undefined
    }

    const nesting_ancestor_index = get_nesting_ancestor_index(
        query,
        subquery_path
    )

    const ancestor_rows = get_ancestor_rows(
        query,
        subquery_path,
        previous_results
    )

    const ancestor_where_clause = get_ancestor_where_clause(
        ancestor_rows,
        subquery_path,
        nesting_ancestor_index,
        query,
        orma_schema
    )

    return ancestor_where_clause
}

/**
 * Gets the closest ancestor that satisfies either of two conditions:
 *   1. has a where or having clause
 *   2. is the root ancestor
 *
 * These are the ancestors that will be split into sequential queries, so we do a server-side nesting for them,
 * rather than duplicating these queries in the database
 *
 * @returns The index in the subquery_path of the nesting ancestor
 */
const get_nesting_ancestor_index = (query, subquery_path: string[]): number => {
    // loop from direct higher entity to root entity
    for (let i = subquery_path.length - 2; i >= 0; i--) {
        const subpath = subquery_path.slice(0, i + 1)
        const subquery = deep_get(subpath, query)
        if (subquery.$where || subquery.$having) {
            return i
        }
    }

    return 0
}

/**
 * Generates a where clause that restricts rows to only be ones connected to a given ancestor through a given route
 * @param ancestor_rows The foreign key values in these will be inserted into the where clause
 * @returns A where clause
 */
const get_ancestor_where_clause = (
    ancestor_rows: Record<string, unknown>[],
    entity_path: string[],
    ancestor_index: number,
    query,
    orma_schema: OrmaSchema
) => {
    const ancestor_to_entity_edge_path = get_query_edge_path(
        query,
        entity_path,
        ancestor_index,
        orma_schema
    )

    const edge_under_ancestor = ancestor_to_entity_edge_path[0]

    if (ancestor_rows === undefined || ancestor_rows.length === 0) {
        const ancestor_name = ancestor_to_entity_edge_path[0].from_entity
        throw Error(`No ancestor rows provided for ${ancestor_name}`)
    }

    const ancestor_foreign_key_values = ancestor_rows
        .map(row => row[edge_under_ancestor.from_field])
        // we need to filter out nulls since foreign keys can be nullable
        .filter(el => el !== null)

    if (ancestor_foreign_key_values.length === 0) {
        // this case where there are no ancestor results can happen if, for example, this is a nested lower entitiy but
        // nothing was returned from the higher entitiy. In this case, we want nothing of this entity to be queried
        // so we use an impossible where clause that returns nothing. We can't use a regular $where $in setup,
        // since that would create an sql error.
        return {
            $eq: ['1', '2'],
        }
    }

    // reverse the path since we are making the where clause in the entity and want to search based on ancestor
    const entity_to_ancestor_edge_path = ancestor_to_entity_edge_path
        // exclude the entity closest to the ancestor, since this entity is already accounted for in the final $in clause
        .slice(1, Infinity)
        // to reverse the path, we have to reverse the order of the edges but also reverse each
        // individual edge
        .reverse()
        .map(edge => reverse_edge(edge))
    const ancestor_query = edge_path_to_where_ins(
        entity_to_ancestor_edge_path,
        '$where',
        {
            $in: [edge_under_ancestor.to_field, ancestor_foreign_key_values],
        },
        false,
        orma_schema
    )

    return ancestor_query
}

const get_query_edge_path = (
    query: any,
    path_to_last_subquery: string[],
    start_path_index: number,
    orma_schema: OrmaSchema
) => {
    let edge_path: Edge[] = []
    // dont run the for loop on the last element, since each for loop iteration makes an edge to the
    for (let i = start_path_index; i < path_to_last_subquery.length - 1; i++) {
        const subquery_path = path_to_last_subquery.slice(0, i + 1)

        const subquery = deep_get(subquery_path, query)
        const subquery_entity = get_real_entity_name(
            path_to_last_subquery[i],
            subquery
        )
        const next_subquery = subquery[path_to_last_subquery[i + 1]]
        const next_subquery_entity = get_real_entity_name(
            path_to_last_subquery[i + 1],
            next_subquery
        )

        const edge = get_direct_edge(
            subquery_entity,
            next_subquery_entity,
            orma_schema,
            next_subquery.$foreign_key
        )
        edge_path.push(edge)
    }

    return edge_path
}
