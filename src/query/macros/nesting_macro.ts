import { deep_get } from '../../helpers/helpers'
import { get_direct_edge } from '../../helpers/schema_helpers'
import { orma_schema } from '../../introspector/introspector'
import { get_real_entity_name } from '../query'
import { combine_wheres } from '../query_helpers'
import { process_any_clause } from './any_path_macro'

/**
 * Add a where clause which handles only getting records that are connected to previous records. Mutates the input query.
 */
export const apply_nesting_macro = (
    query,
    subquery_path: string[],
    previous_results: (string[] | Record<string, unknown>[])[][],
    orma_schema: orma_schema
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

export const get_nesting_where = (
    query,
    subquery_path: string[],
    previous_results: (string[] | Record<string, unknown>[])[][],
    orma_schema: orma_schema
) => {
    const is_root_subquery = subquery_path.length <= 1
    if (is_root_subquery) {
        return undefined
    }

    const nesting_ancestor_index = get_nesting_ancestor_index(
        query,
        subquery_path
    )
    const ancestor_path = subquery_path.slice(0, nesting_ancestor_index + 1)

    const ancestor_result = previous_results.filter(
        previous_result =>
            previous_result[0].toString() === ancestor_path.toString()
    )[0]

    const ancestor_rows = ancestor_result[1] as Record<string, unknown>[]

    const ancestor_to_entity_path = subquery_path.slice(
        nesting_ancestor_index + 1,
        Infinity
    )

    const ancestor_where_clause = get_ancestor_where_clause(
        ancestor_rows,
        ancestor_path,
        ancestor_to_entity_path,
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
    ancestor_path: string[],
    ancestor_to_entity_path: string[],
    query,
    orma_schema: orma_schema
) => {
    const ancestor_name = get_real_entity_name(ancestor_path, query)

    const under_ancestor_path = [...ancestor_path, ancestor_to_entity_path[0]]
    const entity_under_ancestor = get_real_entity_name(
        under_ancestor_path,
        query
    )

    // TODO refactor this so it works
    const edge_under_ancestor = get_direct_edge(
        entity_under_ancestor,
        ancestor_name,
        orma_schema
    )

    if (ancestor_rows === undefined || ancestor_rows.length === 0) {
        throw Error(`No ancestor rows provided for ${ancestor_name}`)
    }

    const ancestor_foreign_key_values = ancestor_rows.map(
        row => row[edge_under_ancestor.to_field]
    )

    const entity_to_ancestor_path = ancestor_to_entity_path.slice().reverse()
    const any_path = entity_to_ancestor_path.slice(
        1,
        entity_to_ancestor_path.length
    )
    const entity_name = entity_to_ancestor_path[0]
    const ancestor_query = process_any_clause(
        {
            $any_path: [
                any_path,
                {
                    $in: [
                        { $raw: edge_under_ancestor.from_field },
                        ancestor_foreign_key_values,
                    ],
                },
            ],
        },
        entity_name,
        '$where',
        orma_schema
    )

    return ancestor_query
}
