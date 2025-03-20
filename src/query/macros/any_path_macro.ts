import { deep_for_each, deep_get, last } from '../../helpers/helpers'
import {
    Edge,
    get_edge_path,
    get_field_is_nullable
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../types/schema/schema_types'
import { get_real_entity_name } from '../query'
import { combine_wheres } from '../query_helpers'

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
export const apply_any_path_macro = (query, orma_schema: OrmaSchema) => {
    let paths_to_any: any[] = []
    deep_for_each(query, (clause, path) => {
        if (clause?.$any_path !== undefined) {
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
        Object.keys(processed_clause).forEach(
            key => (clause[key] = processed_clause[key])
        )
    })
}

export const get_any_path_context_entity = (path, query) => {
    const root_level_keywords = [
        '$where',
        '$having',
        '$select',
        '$order_by',
        '$group_by'
    ]
    const previous_entities = path.flatMap((path_el, i) => {
        if (root_level_keywords.includes(path_el)) {
            return [
                get_real_entity_name(
                    path[i - 1],
                    deep_get(path.slice(0, i), query)
                )
            ]
        } else if (path_el === '$any_path') {
            const path_segment = path.slice(0, i + 1)
            const previous_any = deep_get(path_segment, query)
            const last_any_path = last(previous_any[0])
            return [last_any_path]
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

export const process_any_clause = (
    any_clause,
    initial_entity: string,
    filter_type: '$having' | '$where',
    orma_schema: OrmaSchema
) => {
    const [any_path, subquery] = any_clause.$any_path

    const full_path = [initial_entity].concat(any_path)

    const edge_path = get_edge_path(full_path, orma_schema)
    const clause = edge_path_to_where_ins(
        orma_schema,
        edge_path,
        filter_type,
        subquery
    )

    return clause
}

export const edge_path_to_where_ins = (
    orma_schema: OrmaSchema,
    edge_path: Edge[],
    filter_type: '$having' | '$where',
    subquery: any
) => {
    // we need to reverse the edge path since we are building the where ins
    // from the inside out
    const reversed_edge_path = edge_path.slice().reverse()

    const clause = reversed_edge_path.reduce(
        (acc, edge) => edge_to_where_in(orma_schema, edge, filter_type, acc),
        subquery
    )

    return clause
}

export const edge_to_where_in = (
    orma_schema: OrmaSchema,
    edge: Edge,
    filter_type: '$having' | '$where',
    subquery: any
) => {
    /*
        We need special handling for nulls, since nulls contaminate the entire where in.
        To get a feel for the weirdness, consider the following queries:
        
            SELECT 1 FROM DUAL WHERE 1 IN (2, NULL); -- returns nothing, since 1 is not in the array
            SELECT 1 FROM DUAL WHERE 1 NOT IN (2, NULL); -- also returns nothing?!
        
            SELECT 1 FROM DUAL WHERE NULL IN (1, 2);
            SELECT 1 FROM DUAL WHERE NULL NOT IN (1, 2); -- same story swapping the null and the value
        
        So we basically IN works fine, but NOT IN breaks if there is a null. A simple solution
        is to just filter out all nulls from both sides of the where in
    */
    const from_field_is_nullable = get_field_is_nullable(
        orma_schema,
        edge.from_entity,
        edge.from_field
    )
    const to_field_is_nullable = get_field_is_nullable(
        orma_schema,
        edge.to_entity,
        edge.to_field
    )

    const previous_wheres = subquery === undefined ? [] : [subquery]
    const nullability_wheres = to_field_is_nullable
        ? [{ $not: { $eq: [edge.to_field, null] } }]
        : []
    const inner_where = combine_wheres(
        [...nullability_wheres, ...previous_wheres],
        '$and'
    )

    const in_clause = {
        $in: [
            edge.from_field,
            {
                $select: [edge.to_field],
                $from: edge.to_entity,
                ...(inner_where ? { [filter_type]: inner_where } : {})
            }
        ]
    }

    const outer_where = from_field_is_nullable
        ? { $and: [{ $not: { $eq: [edge.from_field, null] } }, in_clause] }
        : in_clause

    return outer_where
}
