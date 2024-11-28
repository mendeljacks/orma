import { deep_for_each, deep_get, last } from '../../helpers/helpers'
import {
    Edge,
    get_edge_path,
    get_column_is_nullable
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../schema/schema_types'
import { get_real_table_name } from '../query'

/**
 * The first argument to the $any_path macro is a list of connected tables, with the
 * first one being connected to the currently scoped table. The second argument is a where clause. This will be scoped to the last table in the first argument.
 * This will then filter all the current tables, where there is at least one connected current_table -> table1 -> table2 that matches the provided where clause
 * Mutates the input query.
 *
 * @example
 * {
 *   $where: {
 *     $any_path: [['table1', 'table2'], {
 *       ...where_clause_on_table2
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
        const current_table = get_any_path_context_table(clause_path, query)

        const filter_type = get_filter_type(clause_path)
        const processed_clause = process_any_clause(
            clause,
            current_table,
            filter_type,
            orma_schema
        )
        Object.keys(clause).forEach(key => delete clause[key])
        Object.keys(processed_clause).forEach(
            key => (clause[key] = processed_clause[key])
        )
    })
}

export const get_any_path_context_table = (path, query) => {
    const root_level_keywords = [
        '$where',
        '$having',
        '$select',
        '$order_by',
        '$group_by'
    ]
    const previous_tables = path.flatMap((path_el, i) => {
        if (root_level_keywords.includes(path_el)) {
            return [
                get_real_table_name(
                    path[i - 1],
                    deep_get(path.slice(0, i), query)
                )
            ]
        } else if (path_el === '$any_path') {
            const path_segment = path.slice(0, i + 1)
            const previous_any = deep_get(path_segment, query)
            const last_any_path = last(previous_any[0])
            return [last_any_path] || []
        } else {
            return []
        }
    }) as string[]

    const current_table = last(previous_tables)
    return current_table
}

const get_filter_type = path => {
    const filter_type: '$having' | '$where' = last(
        path.filter(path_el => path_el === '$having' || path_el === '$where')
    )
    return filter_type
}

export const process_any_clause = (
    any_clause,
    initial_table: string,
    filter_type: '$having' | '$where',
    orma_schema: OrmaSchema
) => {
    const [any_path, subquery] = any_clause.$any_path

    const full_path = [initial_table].concat(any_path)

    const edge_path = get_edge_path(full_path, orma_schema)
    const clause = edge_path_to_where_ins(edge_path, filter_type, subquery)

    return clause
}

export const edge_path_to_where_ins = (
    edge_path: Edge[],
    filter_type: '$having' | '$where',
    subquery: any
) => {
    // we need to reverse the edge path since we are building the where ins
    // from the inside out
    const reversed_edge_path = edge_path.slice().reverse()

    const clause = reversed_edge_path.reduce((acc, edge) => {
        const new_acc = {
            $in: [
                edge.from_columns,
                {
                    $select: [edge.to_columns],
                    $from: edge.to_table,
                    ...(acc === undefined ? {} : { [filter_type]: acc })
                }
            ]
        }

        return new_acc
    }, subquery)

    return clause
}

/**
new macro stuff:

// validation
if ('any_path' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    any_path: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'array',
                                minItems: 1,
                                items: {
                                    anyOf: [
                                        {
                                            type: 'string'
                                        },
                                        {
                                            type: 'object',
                                            properties: {
                                                from_column: { type: 'string' },
                                                to_table: { type: 'string' },
                                                to_column: { type: 'string' }
                                            },
                                            required: [
                                                'from_column',
                                                'to_table',
                                                'to_column'
                                            ]
                                        }
                                    ]
                                }
                            },
                            where: {
                                type: 'object'
                            }
                        },
                        required: ['path', 'where']
                    }
                },
                required: ['any_path']
            },
            path,
            statement
        )

        const any_path_path = statement?.any_path.path ?? []
        const path_errors =
            any_path_path?.flatMap?.((path_el, i) => {
                const previous_path_el =
                    i === 0 ? table_name : any_path_path[i - 1]
                const previous_table =
                    typeof previous_path_el === 'string'
                        ? previous_path_el
                        : previous_path_el.to_table

                if (typeof path_el === 'string') {
                    const edge_count = get_direct_edge_count(
                        orma_schema,
                        previous_table,
                        path_el
                    )
                    if (edge_count !== 1) {
                        return [
                            {
                                message: `Did not find exactly 1 foreign key between ${format_value(
                                    previous_table
                                )} and ${format_value(path_el)}.`,
                                path: [...path, 'any_path', 'path', i],
                                additional_info: {
                                    number_of_foreign_keys: edge_count
                                }
                            } as OrmaError
                        ]
                    } else {
                        return []
                    }
                } else {
                    get_is_column_name(orma_schema, previous_table, path_el.from_column)
                }
            }) ?? []
        const where_errors = validate_where({
            orma_schema,
            statement: statement?.any_path?.where,
            aliases_by_table,
            path: [...path, 'any_path', 'where'],
            table_name
        })
        return [...base_errors, ...where_errors]
    }


    // type

    {
          readonly any_path: {
              readonly path: readonly (
                  | string
                  | {
                        readonly from_column: string
                        readonly to_table: string
                        readonly to_column: string
                    }
              )[]
              readonly where: Where<Schema, Aliases, Table>
          }
      }
 */
