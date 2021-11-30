import { deep_for_each, deep_get, last } from '../../helpers/helpers'
import { get_edge_path } from '../../helpers/schema_helpers'
import { orma_schema } from '../../introspector/introspector'

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

export const process_any_clause = (
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
                    $from: edge.to_entity ,
                    [filter_type]: acc,
                },
            ],
        }
    }, subquery)

    return clause
}