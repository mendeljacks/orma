import { is_simple_object, last } from '../../helpers/helpers'
import { get_direct_edge, is_reserved_keyword } from '../../helpers/schema_helpers'
import { orma_schema } from '../../introspector/introspector'
import { is_subquery, query_for_each } from '../query_helpers'

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
            value.$select = { $raw: $select }
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

        if (is_simple_object(subquery[key]) && !is_subquery(subquery[key])) {
            return { $as: [subquery[key], key] }
        }

        if (is_simple_object(subquery[key]) && is_subquery(subquery[key])) {
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