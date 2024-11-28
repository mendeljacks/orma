import { escape_value } from '../../helpers/escape'
import {
    clone,
    deep_equal,
    deep_for_each,
    difference,
    last,
} from '../../helpers/helpers'
import { push_path } from '../../helpers/push_path'
import {
    Edge,
    get_table_names,
    get_column_is_nullable,
    get_parent_edges,
    is_parent_table,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../schema/schema_types'
import { WhereConnected } from '../../types/query/query_types'
import { get_real_table_name, get_real_higher_table_name } from '../query'
import { combine_wheres, query_for_each } from '../query_helpers'
import { edge_path_to_where_ins } from './any_path_macro'

export const get_upwards_connection_edges = (orma_schema: OrmaSchema) => {
    const connection_edges = get_table_names(orma_schema).reduce(
        (acc, table_name) => {
            // dont make edges from an table to itself. This prevents infinite loops
            const upwards_edges = get_parent_edges(
                table_name,
                orma_schema
            ).filter(el => el.from_table !== el.to_table)

            if (upwards_edges.length > 0) {
                acc[table_name] = upwards_edges
            }

            return acc
        },
        {} as ConnectionEdges
    )

    return connection_edges
}

export const apply_where_connected_macro = (
    orma_schema: OrmaSchema,
    query: Record<string, any>,
    connection_edges: ConnectionEdges
) => {
    if (!query.$where_connected) {
        return
    }

    // traverse the query and find all subqueries and $where $in clauses that we need to generated
    // where clauses for
    let subquery_locations: { subquery; subquery_path }[] = []
    let where_clause_locations: { where_clause; where_clause_path }[] = []
    query_for_each(query, (subquery, subquery_path) => {
        if (subquery.$where) {
            deep_for_each(
                subquery.$where,
                (where_clause, where_clause_path) => {
                    if (where_clause?.$from) {
                        where_clause_locations.push({
                            where_clause,
                            where_clause_path,
                        })
                    }
                }
            )
        }

        subquery_locations.push({ subquery, subquery_path })
    })

    // generate where clauses for all the paths that we found
    where_clause_locations.forEach(({ where_clause, where_clause_path }) => {
        const table_name = where_clause.$from
        apply_where_connected_to_subquery(
            connection_edges,
            query.$where_connected,
            where_clause,
            table_name,
            undefined,
            orma_schema
        )
    })

    subquery_locations.forEach(({ subquery, subquery_path }) => {
        const table_name = get_real_table_name(last(subquery_path), subquery)
        const higher_table = get_real_higher_table_name(
            subquery_path,
            subquery
        )
        apply_where_connected_to_subquery(
            connection_edges,
            query.$where_connected,
            subquery,
            table_name,
            higher_table,
            orma_schema
        )
    })

    return query
}

const apply_where_connected_to_subquery = (
    connection_edges: ConnectionEdges,
    $where_connected: WhereConnected<OrmaSchema>,
    subquery: any,
    table_name: string,
    higher_table: string | undefined = undefined,
    orma_schema: OrmaSchema
) => {
    const target_table_wheres = $where_connected.map(
        ({ $table, $column, $values }) => {
            const target_where = {
                $in: [
                    $column,
                    $values.map(el =>
                        escape_value(
                            el,
                            orma_schema.tables[$table].database_type
                        )
                    ),
                ],
            }

            const edge_paths_by_destination = get_edge_paths_by_destination(
                connection_edges,
                table_name
            )

            const is_connected_wheres = get_where_connected_clauses(
                orma_schema,
                edge_paths_by_destination,
                table_name,
                $table,
                target_where
            )

            const not_connected_wheres = get_where_not_connected_clauses(
                orma_schema,
                edge_paths_by_destination,
                table_name,
                $table
            )

            // considered connected to a specific target table if one of the edge paths
            // are connected, or if none of the edge paths are connected
            return combine_wheres(
                [...is_connected_wheres, ...not_connected_wheres],
                '$or'
            )
        }
    )

    // only return results that would have been returned by the user where, and are connected
    // (or have no connections) to every table in the $where_connected
    const existing_wheres = [subquery.$where] ?? []
    const new_where = combine_wheres(
        [...existing_wheres, ...target_table_wheres],
        '$and'
    )

    subquery.$where = new_where
}

export const get_where_connected_clauses = (
    orma_schema: OrmaSchema,
    edge_paths_by_destination: ReturnType<typeof get_edge_paths_by_destination>,
    filtered_table: string,
    target_table: string,
    target_where: Record<string, any>
) => {
    // the as typeof... on this line is completely unnecessary and is here because typescript is buggy
    const edge_paths = (edge_paths_by_destination[target_table] ??
        []) as typeof edge_paths_by_destination[string]

    // This optimization was not working with multiple edge paths, where an edge path is the higher table,
    // but the higher table is a reverse nest and the edge path also starts with a reverse nest (the higher table)
    // maybe add this back after properly thinking through the implications...
    // // (optimization) if the higher table is the parent table, we dont need to do extra filtering.
    // // This is because orma will already filter this to be a child of the higher table,
    // // so we only need to put the extra where clause on the higher table.
    // // We only check the table since the column of the foreign key is inferred by orma (there must be only one)
    // const edge_paths = all_edge_paths.filter(
    //     edge_path =>
    //         higher_table === undefined || // if no higher table is provided, then skip the optimization
    //         edge_path[0].to_table !== higher_table
    // )

    const clauses = edge_paths.map(edge_path => {
        const clause = edge_path_to_where_ins(edge_path, '$where', target_where)

        return clause
    })

    // if the table that we are generating the where clause for is the same as the $where_connected table,
    // then we need to generate an extra where clause, since an table is always connected to itself,
    // but there is no edge in the connection_edges stating this
    if (target_table === filtered_table) {
        clauses.push(target_where)
    }

    return clauses
}

const get_where_not_connected_clauses = (
    orma_schema: OrmaSchema,
    edge_paths_by_destination: ReturnType<typeof get_edge_paths_by_destination>,
    filtered_table: string,
    target_table: string
) => {
    // tables are always connected to themself, so a where not connected clause makes
    // no sense if the target table is also the filtered table
    if (target_table === filtered_table) {
        return []
    }

    // the as typeof... on this line is completely unnecessary and is here because typescript is buggy
    const edge_paths = (edge_paths_by_destination[target_table] ??
        []) as typeof edge_paths_by_destination[string]

    // TODO: write up a proper explanation with truth tables. Basically the where clause checks that there
    // is at least one connected record. But in cases where all edge paths have a nullable (or reverse nested)
    // edge, then there could be NO connected record. In that case, there is not one connected record, but since
    // there are also no non-connected records, we allow it explicitly. Note that this only applies
    // if we are not directly checking the root level (which is why its in the else)
    const should_check_no_connected_table =
        edge_paths.length > 0 &&
        edge_paths.every(edge_path => {
            const is_nullable_or_reversed = edge_path.some(edge => {
                const is_reversed = is_parent_table(
                    edge.from_table,
                    edge.to_table,
                    orma_schema
                )
                const is_nullable =
                    !is_reversed &&
                    get_column_is_nullable(
                        orma_schema,
                        edge.from_table,
                        edge.from_columns
                    )

                return is_reversed || is_nullable
            })
            return is_nullable_or_reversed
        })

    // this clause is true if there are no connected tables
    if (should_check_no_connected_table) {
        const no_connected_table_clauses = edge_paths.map(edge_path => {
            const clause = edge_path_to_where_ins(
                edge_path,
                '$where',
                undefined
            )

            return clause
        })

        return [
            {
                $not: {
                    /*
                    We need special handling for the not in clause, since nulls contaminate the entire where in.
                    To get a feel for the weirdness, consider the following queries:
                    
                        SELECT 1 FROM DUAL WHERE 1 IN (2, NULL); -- returns nothing, since 1 is not in the array
                        SELECT 1 FROM DUAL WHERE 1 NOT IN (2, NULL); -- also returns nothing?!
                    
                        SELECT 1 FROM DUAL WHERE NULL IN (1, 2);
                        SELECT 1 FROM DUAL WHERE NULL NOT IN (1, 2); -- same story swapping the null and the value
                    
                    So we basically IN works fine, but NOT IN breaks if there is a null. A simple solution
                    is to just coalesce the NULLs into FALSE, which gives the expected behaviour
                    */
                    $coalesce: [
                        combine_wheres(no_connected_table_clauses, '$or'),
                        false,
                    ],
                },
            },
        ]
    } else {
        return []
    }
}

export const get_edge_paths_by_destination = (
    connection_edges: ConnectionEdges,
    source_table: string
) => {
    // start off with a path to every connected edge
    let edge_paths =
        connection_edges?.[source_table]?.map(edge => [
            { ...edge, from_table: source_table },
        ]) ?? []

    // every path before this index is done, in other words there are no more paths that we can get
    // by appending some connected edge onto that path
    let next_index = 0

    // TODO: remove this commented code after I make sure mutation check tests work
    // TODO: explain how this for loop works in a comment (expands as it goes), maybe convert to while
    //       loop so it is clearer

    // keep looping while there are still paths to process
    // while (next_index < edge_paths.length) {
    //     const current_index = next_index
    //     next_index = edge_paths.length
    for (let i = 0; i < edge_paths.length; i++) {
        // for each unprocessed path, generate new paths by appending all possible
        // connected edges onto its end
        const edge_path = edge_paths[i]
        const parent_table = last(edge_path).to_table
        const new_paths =
            connection_edges?.[parent_table]
                // filter edges to exclude edges already in this path. Only allowing each edge once per path
                // prevents infinite loops in the connection paths
                ?.filter(connection_edge =>
                    edge_path.every(
                        edge =>
                            edge.from_column !== connection_edge.from_column ||
                            edge.to_table !== connection_edge.to_table ||
                            edge.to_column !== connection_edge.to_column
                    )
                )
                // generate a new path by appending the connection edge
                .map(connection_edge => {
                    const new_edge = {
                        ...connection_edge,
                        from_table: parent_table,
                    }
                    return [...edge_path, new_edge]
                }) ?? []

        edge_paths.push(...new_paths)
    }
    // }

    // split edge paths by table since we only want paths to tables that are in the $where_connected clause
    const connection_paths = edge_paths.reduce(
        (acc, raw_edge_path) => {
            const target_table = last(raw_edge_path).to_table
            if (!acc[target_table]) {
                acc[target_table] = []
            }

            // in an edge path, the target table should only appear once, since target tables
            // are always connected to themselves and only themselves. This means anything
            // after the first instance of the target table is redundant. This can happen
            // in an edge path like: A -> B -> C -> B, where B is the target table. So we
            // would remove the B -> C and C -> B edges.
            const first_taget_index = raw_edge_path.findIndex(
                edge => edge.to_table === target_table
            )
            const trimmed_edge_path = raw_edge_path.slice(
                0,
                first_taget_index + 1
            )

            // removing part of the edge path can cause there to be duplicates, so check for that
            const edge_path_exists =
                acc[target_table].find(existing_edge_path =>
                    deep_equal(existing_edge_path, trimmed_edge_path)
                ) !== undefined

            if (!edge_path_exists) {
                acc[target_table].push(trimmed_edge_path)
            }

            return acc
        },
        {} as {
            [target_table: string]: Edge[][]
        }
    )

    return connection_paths
}

// TODO: make validation that ensures an table / column combination cannot appear more than once in a $where_connected

/**
 * Add the given edge and removes the reverse edge if it exists, to prevent infinite loops
 */
export const add_connection_edges = (
    connection_edges: ConnectionEdges,
    new_edges: Edge[]
): ConnectionEdges => {
    // shallow clone to not mutate input
    const new_connection_edges = {
        ...connection_edges,
    }

    new_edges.forEach(new_edge => {
        const existing_edges = new_connection_edges[new_edge.from_table] ?? []

        new_connection_edges[new_edge.from_table] = [
            ...existing_edges,
            {
                from_column: new_edge.from_columns,
                to_table: new_edge.to_table,
                to_column: new_edge.to_columns,
            },
        ]
    })

    return new_connection_edges
}

export const remove_connection_edges = (
    connection_edges: ConnectionEdges,
    edges_to_remove: Edge[]
): ConnectionEdges => {
    // shallow clone to not mutate input
    const new_connection_edges = {
        ...connection_edges,
    }

    edges_to_remove.forEach(edge_to_remove => {
        if (new_connection_edges[edge_to_remove.from_table]) {
            // find the edge and exclude it from result
            new_connection_edges[edge_to_remove.from_table] =
                new_connection_edges[edge_to_remove.from_table].filter(
                    edge => !deep_equal(edge, edge_to_remove)
                )
        }
    })

    return new_connection_edges
}

/*
This defines the concept of 'connected' for this macro. Each table gets a list of edges that are considered connected.
Connected paths are generated by traversing all possible paths in these edges. Each connected path then generates a where
clause that filters results to be connected via these connected paths.
 */
export type ConnectionEdges = {
    [source_table: string]: {
        from_column: string
        to_table: string
        to_column: string
    }[]
}

/**
 * MUTATES THE INPUT QUERY.
 * Ensures that the where connected are allowable, and generates default where connecteds if there are none. Specifically,
 * generates errors if any where connected has values that are not in the given list of restrictions for that table and
 * column. If there is no where connected for a restriction, then the entire restriction is added as a where connected.
 */
export const restrict_where_connected = (
    query,
    where_connected_restrictions: WhereConnected<OrmaSchema>
) => {
    const errors = where_connected_restrictions.flatMap(
        where_connected_restriction => {
            // combine given values in the where connected
            const given_values =
                query?.$where_connected?.reduce(
                    (acc, { $table, $column, $values }) => {
                        if (
                            $table === where_connected_restriction.$table &&
                            $column === where_connected_restriction.$column
                        ) {
                            acc.push(...$values)
                        }
                        return acc
                    },
                    [] as (string | number)[]
                ) ?? []

            if (given_values.length === 0) {
                // default to the maximum allowed users for this user. If the magic perm is present, this is all users
                // so we dont add any $where_connected. Otherwise, the user only has access to one user
                push_path(
                    ['$where_connected'],
                    clone(where_connected_restriction),
                    query
                )
            } else {
                const forbidden_values = difference(
                    given_values,
                    where_connected_restriction.$values
                )

                if (forbidden_values.length > 0) {
                    return [
                        {
                            message: `Where connected only allows ${
                                where_connected_restriction.$table
                            } ${
                                where_connected_restriction.$column
                            } ${where_connected_restriction.$values.join(
                                ', '
                            )} but ${forbidden_values} was given.`,
                            path: ['$where_connected'],
                            additional_info: {
                                where_connected_restriction,
                                given_where_connected: query.$where_connected,
                                forbidden_values,
                            },
                        },
                    ]
                }
            }

            return []
        }
    )

    return errors
}
