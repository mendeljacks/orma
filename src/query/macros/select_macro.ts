import { escapeId } from 'sqlstring'
import { is_simple_object, last } from '../../helpers/helpers'
import {
    get_direct_edge,
    get_direct_edges,
    is_reserved_keyword,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { get_real_entity_name, get_real_higher_entity_name } from '../query'
import { is_subquery, query_for_each } from '../query_helpers'

/**
 * Applies the select macro. Mutates the input query
 */
export const apply_select_macro = (query, orma_schema: OrmaSchema) => {
    query_for_each(query, (value, path) => {
        const new_select = get_select(value, path, query, orma_schema)
        const existing_select = value.$select ?? []
        const $select = [...existing_select, ...new_select]
        const $from = value.$from ?? last(path)

        if ($select) {
            value.$select = $select
        }

        if ($from) {
            value.$from = $from
        }

        const new_select_names = new_select.map(el =>
            // @ts-ignore
            el?.$as ? el.$as[1] : el
        )
        for (const select of new_select_names) {
            delete value[select]
        }
    })
}

export const get_select = (
    subquery,
    subquery_path: string[],
    query,
    orma_schema: OrmaSchema
) => {
    const entity_name = get_real_entity_name(last(subquery_path), subquery)

    const $select = Object.keys(subquery).flatMap(key => {
        if (is_reserved_keyword(key)) {
            return []
        }

        if (subquery[key] === true) {
            return key
        }

        const is_string_field = typeof subquery[key] === 'string'
        const is_function_field =
            is_simple_object(subquery[key]) && !is_subquery(subquery[key])
        if (is_string_field || is_function_field) {
            return { $as: [subquery[key], key] }
        }

        if (is_simple_object(subquery[key]) && is_subquery(subquery[key])) {
            const lower_subquery = subquery[key]
            const lower_subquery_entity = lower_subquery.$from ?? key
            const edges_to_lower_table = get_direct_edges(
                entity_name,
                lower_subquery_entity,
                orma_schema
            )

            return edges_to_lower_table.map(el => el.from_field)
        }

        return [] // subqueries are not handled here
    })

    if (subquery_path.length > 1) {
        const higher_entity = get_real_higher_entity_name(subquery_path, query)
        const edges_to_higher_entity = get_direct_edges(
            entity_name,
            higher_entity,
            orma_schema
        )
        $select.push(...edges_to_higher_entity.map(el => el.from_field))
    }

    return [...new Set($select)] // unique values
}
