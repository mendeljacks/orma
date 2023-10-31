import { is_simple_object, last } from '../../helpers/helpers'
import { NesterDeletion } from '../../helpers/nester'
import {
    get_direct_edges,
    is_reserved_keyword,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../types/schema/schema_types'
import { get_real_entity_name, get_real_higher_entity_name } from '../query'
import { is_subquery, query_for_each } from '../query_helpers'

/**
 * Applies the select macro. Mutates the input query
 */
export const apply_select_macro = (query, orma_schema: OrmaSchema) => {
    let nester_deletions: { [stringified_path: string]: NesterDeletion[] } = {}
    query_for_each(query, (value, path) => {
        const existing_select = value.$select ?? []
        const converted_select = get_converted_select(value)
        const new_select = get_new_select(value, path, query, orma_schema)

        // any selects we added should be removed by the nester so the user doesnt get them
        const selects_to_delete_in_nester = new_select.filter(
            new_el =>
                !existing_select.includes(new_el) &&
                !converted_select.includes(new_el)
        )
        nester_deletions[JSON.stringify(path)] =
            selects_to_delete_in_nester.map(field => ({
                field,
            }))

        const $select = [
            ...new Set([
                ...existing_select,
                ...converted_select,
                ...new_select,
            ]),
        ]
        const $from = value.$from ?? last(path)

        if ($select) {
            value.$select = $select
        }

        if ($from) {
            value.$from = $from
        }

        const converted_select_fields = converted_select.map(el =>
            // @ts-ignore
            el?.$as ? el.$as[1] : el
        )
        for (const select of converted_select_fields) {
            delete value[select]
        }
    })

    return nester_deletions
}

export const get_converted_select = subquery => {
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

        return [] // subqueries are not handled here
    })

    return $select
}

export const get_new_select = (
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

        return []
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

    return [...new Set($select)]
}
