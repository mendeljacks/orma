/**
 * This file contains pure functions which help parse orma schemas
 * @module
 */

import { OrmaSchema } from '../schema/schema_types'

export type Edge = {
    from_table: string
    from_columns: string[]
    to_table: string
    to_columns: string[]
}

export const get_table_names = (orma_schema: OrmaSchema) => {
    return Object.keys(orma_schema.tables)
}

/**
 * @returns a list of columns attatched to the given table
 */
export const get_column_names = (
    orma_schema: OrmaSchema,
    table_name: string
) => {
    return Object.keys(orma_schema.tables?.[table_name]?.columns ?? {})
}

/**
 * @returns given an table, returns true if the table is in the schema
 */
export const get_is_table_name = (orma_schema: OrmaSchema, table_name: any) =>
    !!orma_schema?.tables?.[table_name]

export const get_is_column_name = (
    orma_schema: OrmaSchema,
    table_name: any,
    column_name: any
) => !!orma_schema?.tables?.[table_name]?.columns?.[column_name]

/**
 * Gets a list of edges from given table -> parent table
 */
export const get_parent_edges = (
    table_name: string,
    orma_schema: OrmaSchema
): Edge[] => {
    const table_schema =
        orma_schema.tables[table_name] ?? ({} as OrmaSchema['tables'][string])
    const foreign_keys = table_schema.foreign_keys ?? []
    const edges = foreign_keys.map(foreign_key => ({
        from_table: table_name,
        from_column: foreign_key?.$columns?.[0],
        to_table: foreign_key?.$references?.$table,
        to_column: foreign_key?.$references?.$columns?.[0]
    }))
    return edges
}

/**
 * Swaps the 'from' and 'to' components of an edge
 */
export const reverse_edge = (edge: Edge): Edge => ({
    from_table: edge.to_table,
    from_columns: edge.to_columns,
    to_table: edge.from_table,
    to_columns: edge.from_columns
})

/**
 * Gets a list of edges from given table -> child table
 */
export const get_child_edges = (
    table_name: string,
    orma_schema: OrmaSchema
): Edge[] => {
    const foreign_keys =
        orma_schema.cache?.reversed_foreign_keys?.[table_name] ?? []
    const edges = foreign_keys.map(foreign_key => ({
        from_table: table_name,
        ...foreign_key
    }))
    return edges
}

/**
 * Gets a list of edges from given table -> parent or child table
 */
export const get_all_edges = (table_name, orma_schema) => {
    const parent_edges = get_parent_edges(table_name, orma_schema)
    const child_edges = get_child_edges(table_name, orma_schema)
    return [...parent_edges, ...child_edges]
}

/**
 * Returns true if the input is a reserved keyword, which means it starts with $ like $select or $or
 */
export const is_reserved_keyword = (keyword: any) => keyword?.[0] === '$'

/**
 * Gets possible parent or child edges between two tables that are immediate child/parent or parent/child
 */
export const get_direct_edges = (
    from_table: string,
    to_table: string,
    orma_schema: OrmaSchema
) => {
    const possible_edges = get_all_edges(from_table, orma_schema)
    const edges = possible_edges.filter(el => el.to_table === to_table)
    return edges
}

/**
 * Gets possible parent or child edges between two tables that are immediate child/parent or parent/child
 */
export const get_direct_edge_count = (
    orma_schema: OrmaSchema,
    from_table: string,
    to_table: string
) => {
    const foreign_keys = orma_schema.tables[from_table]?.foreign_keys ?? []
    const parent_edge_count = foreign_keys.reduce((acc, foreign_key) => {
        if (foreign_key.referenced_table === to_table) {
            return acc + 1
        } else {
            return acc
        }
    }, 0)

    const reversed_foreign_keys =
        orma_schema.cache?.foreign_keys_by_parent[from_table] ?? []
    const child_edge_count = reversed_foreign_keys.reduce(
        (acc, reverse_foreign_key) => {
            if (reverse_foreign_key.table === to_table) {
                return acc + 1
            } else {
                return acc
            }
        },
        0
    )

    return parent_edge_count + child_edge_count
}

/* just like get edges, but only returns one conenction between two directly connected tables.
 * This will throw an error if there is not exactly one edge
 */
export const get_direct_edge = (
    from_table: string,
    to_table: string,
    orma_schema: OrmaSchema,
    foreign_key_override: string[] | undefined = undefined
) => {
    const parent_edges = get_parent_edges(from_table, orma_schema).filter(
        el => el.to_table === to_table
    )
    const child_edges = get_child_edges(from_table, orma_schema).filter(
        el => el.to_table === to_table
    )

    const filtered_parent_edges = foreign_key_override
        ? parent_edges.filter(
              edge => edge.from_columns === foreign_key_override[0]
          )
        : parent_edges

    const filtered_child_edges = foreign_key_override
        ? child_edges.filter(
              edge => edge.to_columns === foreign_key_override[0]
          )
        : child_edges

    const edges = [...filtered_parent_edges, ...filtered_child_edges]

    if (edges.length !== 1) {
        throw Error(
            `Did not find exactly one edge from ${from_table} to ${to_table}`
        )
    }

    return edges[0]
}

/**
 * returns a list of edges which, when traversed one after the other, connect the first given table to the last.
 * The total length of the edge_path will be `tables.length - 1`.
 * This function will throw an error if there is more than one edge between any two tables in the table list
 * @param tables a list of directly connected tables
 */
export const get_edge_path = (
    tables: string[],
    orma_schema: OrmaSchema
): Edge[] => {
    if (tables.length <= 1) {
        return []
    }

    const edge_path = tables.flatMap((table, i) => {
        if (i === 0) {
            // if (tables.length === 1) {
            //     return { root: table, to_table: table }
            // } else {
            //     return []
            // }
            return []
        }

        const from_table = tables[i - 1]
        const to_table = tables[i]

        const edge = get_direct_edge(from_table, to_table, orma_schema)

        return edge
    })

    return edge_path
}

/**
 * Returns true if table1 is a parent of table2
 */
export const is_parent_table = (
    table1: string,
    table2: string,
    orma_schema: OrmaSchema
) => {
    const child_edges = orma_schema.cache?.reversed_foreign_keys?.[table1]
    return child_edges?.some(edge => edge.to_table === table2)
}

/**
 * Gets a list of column names which have been marked as primary keys. More than one result indicates a compound primary key
 */
export const get_primary_keys = (
    table_name: string,
    orma_schema: OrmaSchema
) => {
    const primary_key_columns =
        orma_schema.tables[table_name].primary_key?.$columns

    return primary_key_columns as string[]
}

/**
 * Gets a list of column names which have been marked as unique, grouped into arrays to include indexes with
 * multiple columns. Optionally excludes nullable unique columns.
 *
 * @example
 * return [
 *   ['unique_column'],
 *   ['primary_key_column'],
 *   ['compound_unique_column1', 'compound_unique_column2']
 * ]
 */
export const get_unique_column_groups = (
    table_name: string,
    exclude_nullable: boolean,
    orma_schema: OrmaSchema
): string[][] => {
    const unique_keys = orma_schema.tables[table_name]?.unique_keys ?? []
    const unique_column_groups = unique_keys
        .filter(unique_key => {
            if (exclude_nullable) {
                const all_columns_non_nullable = unique_key.$columns?.every(
                    column => {
                        const column_schema =
                            orma_schema.tables[table_name].columns?.[column]
                        return column_schema?.$not_null
                    }
                )

                return all_columns_non_nullable
            } else {
                return true
            }
        })
        .map(unique_key => unique_key.$columns)

    return unique_column_groups as string[][]
}

export const column_exists = (
    table: string,
    column: string | number,
    schema: OrmaSchema
) => {
    return !!schema.tables[table]?.columns?.[column]
}

/**
 * Returns true if a column is required to be initially provided by the user. Any column with a default is not required,
 * which includes nullable columns which default to null.
 */
export const is_required_column = (
    table: string,
    column: string,
    schema: OrmaSchema
) => {
    const column_schema = schema?.tables?.[table]?.columns?.[column]
    const is_required =
        !!column_schema?.$not_null &&
        column_schema?.$default === undefined &&
        !column_schema?.$auto_increment
    return is_required
}

export const get_column_is_nullable = (
    schema: OrmaSchema,
    table: string,
    column: string
) => {
    const column_schema = schema?.tables?.[table]?.columns?.[column]
    const is_nullable = !column_schema?.$not_null
    return is_nullable
}

export const get_parent_edges_for_column = (
    table: string,
    column: string,
    orma_schema: OrmaSchema
) => {
    const parent_edges = get_parent_edges(table, orma_schema)
    const matching_edges = parent_edges.filter(el => el.from_columns === column)
    return matching_edges
}

export const get_column_schema = (
    schema: OrmaSchema,
    table: string,
    column: string
) => {
    const column_schema = schema?.tables?.[table]?.columns?.[column]
    return column_schema
}

export const can_have_guid = (
    schema: OrmaSchema,
    table: string,
    column: string
) => {
    const is_primary_key =
        schema?.tables?.[table]?.primary_key?.$columns?.includes(column)
    const foreign_keys = schema?.tables?.[table]?.foreign_keys ?? []
    const is_foreign_key = foreign_keys.some(el =>
        el.$columns?.includes(column)
    )

    return is_primary_key || is_foreign_key
}
