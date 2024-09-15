import { orma_escape } from '../../helpers/escape'
import {
    deep_for_each,
    deep_set,
    is_simple_object,
    last,
} from '../../helpers/helpers'
import { NesterAddition } from '../../helpers/nester'
import { OrmaSchema } from '../../schema/schema_types'
import { get_any_path_context_table } from './any_path_macro'

export const apply_escape_macro = (query, orma_schema: OrmaSchema) => {
    return apply_escape_macro_to_query_part(orma_schema, undefined, query)
}

// can be used to escape only parts of queries, for example only escaping a $where clause
export const apply_escape_macro_to_query_part = (
    orma_schema: OrmaSchema,
    root_table: string | undefined,
    query
) => {
    let raw_paths: any[] = []
    let nester_additions: NesterAddition[] = []

    deep_for_each(query, (value, path) => {
        // We can select an escaped value, to simply return that value. For strings and numbers,
        // we can send something like SELECT 1 AS my_column to our database and have it return
        // 1 for every row. This also lets us do computed values or having clauses using my_column.
        // however this wont work for ararys and objects, so we need to remove these from the query
        //  - they will be added back to the query results later.
        if (last(path) === '$select') {
            const select = value as any[]
            const delete_indices = select
                .flatMap((select_el, i) => {
                    const escape_value = select_el?.$as?.[0]?.$escape

                    const is_object_or_array =
                        Array.isArray(escape_value) ||
                        is_simple_object(escape_value)
                    return is_object_or_array ? [i] : []
                })
                // deletions need to start from the end to not mess up the indices
                .reverse()
            delete_indices.forEach(i => {
                // make sure the escaped select is added back in later by the nester
                nester_additions.push({
                    value: select[i].$as[0].$escape,
                    column: select[i].$as[1],
                })
                select.splice(i, 1)
            })
        }

        // handle regular escapes
        const escape_value = value?.$escape
        const is_object_or_array =
            Array.isArray(escape_value) || is_simple_object(escape_value)
        const is_deleted = path.includes('select') && is_object_or_array
        if (escape_value !== undefined && !is_deleted) {
            raw_paths.push([path, value])
        }
    })

    // reverse order so we process from lowest to highest keys so mutations
    // dont invalidate lower paths
    raw_paths.reverse()

    raw_paths.forEach(([path, value]) => {
        if (path.length === 0) {
            if (path.length === 0) {
                throw new Error("Can't use the $escape keyword on the root.")
            }
        }

        const table = get_any_path_context_table(path, query) ?? root_table

        deep_set(
            path,
            orma_escape(
                value.$escape,
                orma_schema.tables[table].database_type
            ),
            query
        )
    })

    return nester_additions
}
