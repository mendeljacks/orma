import { deep_for_each, deep_get, deep_set, last } from '../helpers/helpers'
import {
    get_direct_edge,
    get_edge_path,
    is_reserved_keyword,
} from '../helpers/schema_helpers'
import { orma_schema } from '../introspector/introspector'
import { get_real_entity_name, get_real_parent_name } from './query'
import { combine_wheres, is_subquery, query_for_each } from './query_helpers'

/**
 * Applies the select macro. Mutates the input query
 */
export const apply_select_macro = (query, orma_schema: orma_schema) => {
    query_for_each(query, (value, path) => {
        const new_select = get_select(value, path, orma_schema)
        const existing_select = query.$select ?? []
        const $select = [...new_select, ...existing_select]
        const $from = value.$from ?? last(path)

        if ($select) {
            value.$select = $select
        }

        if ($from) {
            value.$from = $from
        }

        const new_select_names = new_select.map(el => el?.$as ? el.$as[1] : el)
        for (const select of new_select_names) {
            delete value[select]
        }
    })
}

export const get_select = (
    subquery,
    subquery_path: string[],
    orma_schema: orma_schema
) => {
    const entity_name = last(subquery_path)

    const $select = Object.keys(subquery).flatMap(key => {
        if (is_reserved_keyword(key)) {
            return []
        }

        if (subquery[key] === true) {
            return key
        }

        if (typeof subquery[key] === 'string') {
            return { $as: [subquery[key], key] }
        }

        if (typeof subquery[key] === 'object' && !is_subquery(subquery[key])) {
            return { $as: [subquery[key], key] }
        }

        if (typeof subquery[key] === 'object' && is_subquery(subquery[key])) {
            const lower_subquery = subquery[key]
            const lower_subquery_entity = lower_subquery.$from ?? key
            const edge_to_lower_table = get_direct_edge(
                entity_name,
                lower_subquery_entity,
                orma_schema
            )

            return edge_to_lower_table.from_field
        }

        return [] // subqueries are not handled here
    })

    if (subquery_path.length > 1) {
        const higher_entity = subquery_path[subquery_path.length - 2]
        const edge_to_higher_entity = get_direct_edge(
            entity_name,
            higher_entity,
            orma_schema
        )
        $select.push(edge_to_higher_entity.from_field)
    }

    return [...new Set($select)] // unique values
}

/**
 * The first argument to the $any_path macro is a list of connected entities, with the
 * first one being connected to the currently scoped entity. The second argument is a where clause. This will be scoped to the last table in the first argument.
 * This will then filter all the current entities, where there is at least one connected current_entity -> entity1 -> entity2 that matches the provided where clause
 * Mutates the input query.
 *
 * @example
 * {
 *   $where: {
 *     $any_path: [['entity1', 'entity2'], {
 *       ...where_clause_on_entity2
 *     }]
 *   }
 * }
 */
export const apply_any_path_macro = (query, orma_schema: orma_schema) => {
    let paths_to_any = []
    deep_for_each(query, (clause, path) => {
        if (clause.$any_path) {
            paths_to_any.push([clause, path])
        }
    })

    // since we are mutating stuff, we need to mutate the children before the parents so we dont break stored
    // paths when applying the macro
    paths_to_any.reverse()

    paths_to_any.forEach(([clause, clause_path]) => {
        const current_entity = get_any_path_context_entity(clause_path, query)

        const filter_type = get_filter_type(clause_path)
        const processed_clause = process_any_clause(
            clause,
            current_entity,
            filter_type,
            orma_schema
        )
        Object.keys(clause).forEach(key => delete clause[key])
        Object.keys(processed_clause).forEach(key => clause[key] = processed_clause[key])
    })
}

const get_any_path_context_entity = (path, query) => {
    const previous_entities = path.flatMap((path_el, i) => {
        if (path_el === '$where' || path_el === '$having') {
            return path[i - 1]
        } else if (path_el === '$any_path') { // TODO: add test for this
            const path_segment = path.slice(0, i + 1)
            const previous_any = deep_get(path_segment, query)
            return last(previous_any[0])
        } else {
            return []
        }
    }) as string[]

    const current_entity = last(previous_entities)
    return current_entity
}

const get_filter_type = path => {
    const filter_type: '$having' | '$where' = last(
        path.filter(path_el => path_el === '$having' || path_el === '$where')
    )
    return filter_type
}

const process_any_clause = (
    any_clause,
    initial_entity: string,
    filter_type: '$having' | '$where',
    orma_schema: orma_schema
) => {
    const [any_path, subquery] = any_clause.$any_path

    const full_path = [initial_entity].concat(any_path)
    const edge_path = get_edge_path(full_path, orma_schema).reverse()
    const clause = edge_path.reduce((acc, edge) => {
        return {
            $in: [
                edge.from_field,
                {
                    $select: [edge.to_field],
                    $from: edge.to_entity,
                    [filter_type]: acc,
                },
            ],
        }
    }, subquery)

    return clause
}

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

    const nesting_where = get_nesting_where(query, subquery_path, previous_results, orma_schema)
    const combined_where = combine_wheres([subquery.$where, nesting_where], '$and')
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

    const ancestor_result = previous_results
        .filter(
            previous_result =>
                previous_result[0].toString() === ancestor_path.toString()
        )[0]

    const ancestor_rows = ancestor_result[1] as Record<string, unknown>[]


    const ancestor_to_entity_path = subquery_path
        .slice(nesting_ancestor_index + 1, Infinity)

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
    const entity_under_ancestor = get_real_entity_name(under_ancestor_path, query)
    
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
    const any_path = entity_to_ancestor_path.slice(1, entity_to_ancestor_path.length)
    const entity_name = entity_to_ancestor_path[0]
    const ancestor_query = process_any_clause(
        {
            $any_path: [
                any_path,
                {
                    $in: [
                        edge_under_ancestor.from_field,
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
