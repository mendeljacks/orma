import { orma_escape } from '../../helpers/escape'
import {
    clone,
    deep_equal,
    deep_for_each,
    difference,
    last
} from '../../helpers/helpers'
import { push_path } from '../../helpers/push_path'
import {
    Edge,
    get_entity_names,
    get_field_is_nullable,
    get_parent_edges,
    is_parent_entity
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../types/schema/schema_types'
import { WhereConnected } from '../../types/query/query_types'
import { get_real_entity_name, get_real_higher_entity_name } from '../query'
import { combine_wheres, query_for_each } from '../query_helpers'
import { edge_path_to_where_ins, edge_to_where_in } from './any_path_macro'

export const get_upwards_connection_edges = (orma_schema: OrmaSchema) => {
    const connection_edges = get_entity_names(orma_schema).reduce(
        (acc, entity_name) => {
            // dont make edges from an entity to itself. This prevents infinite loops
            const upwards_edges = get_parent_edges(
                entity_name,
                orma_schema
            ).filter(el => el.from_entity !== el.to_entity)

            if (upwards_edges.length > 0) {
                acc[entity_name] = upwards_edges
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
                            where_clause_path
                        })
                    }
                }
            )
        }

        subquery_locations.push({ subquery, subquery_path })
    })

    // generate where clauses for all the paths that we found
    where_clause_locations.forEach(({ where_clause, where_clause_path }) => {
        const entity_name = where_clause.$from
        apply_where_connected_to_subquery(
            connection_edges,
            query.$where_connected,
            where_clause,
            entity_name,
            undefined,
            orma_schema
        )
    })

    subquery_locations.forEach(({ subquery, subquery_path }) => {
        const entity_name = get_real_entity_name(last(subquery_path), subquery)
        const higher_entity = get_real_higher_entity_name(
            subquery_path,
            subquery
        )
        apply_where_connected_to_subquery(
            connection_edges,
            query.$where_connected,
            subquery,
            entity_name,
            higher_entity,
            orma_schema
        )
    })

    return query
}

const apply_where_connected_to_subquery = (
    connection_edges: ConnectionEdges,
    $where_connected: WhereConnected<OrmaSchema>,
    subquery: any,
    entity_name: string,
    higher_entity: string | undefined = undefined,
    orma_schema: OrmaSchema
) => {
    const target_entity_wheres = $where_connected.map(
        ({ $entity, $field, $values }) => {
            const target_where = {
                $in: [
                    $field,
                    $values.map(el =>
                        orma_escape(
                            el,
                            orma_schema.$entities[$entity].$database_type
                        )
                    )
                ]
            }

            const edge_paths_by_destination = get_edge_paths_by_destination(
                connection_edges,
                entity_name
            )

            const is_connected_wheres = get_where_connected_clauses(
                orma_schema,
                edge_paths_by_destination,
                entity_name,
                $entity,
                target_where
            )

            const not_connected_wheres = get_where_not_connected_clauses(
                orma_schema,
                edge_paths_by_destination,
                entity_name,
                $entity
            )

            // considered connected to a specific target entity if one of the edge paths
            // are connected, or if none of the edge paths are connected
            return combine_wheres(
                [...is_connected_wheres, ...not_connected_wheres],
                '$or'
            )
        }
    )

    // only return results that would have been returned by the user where, and are connected
    // (or have no connections) to every entity in the $where_connected
    const existing_wheres = [subquery.$where]
    const new_where = combine_wheres(
        [...existing_wheres, ...target_entity_wheres],
        '$and'
    )

    subquery.$where = new_where
}

export const get_where_connected_clauses = (
    orma_schema: OrmaSchema,
    edge_paths_by_destination: ReturnType<typeof get_edge_paths_by_destination>,
    filtered_entity: string,
    target_entity: string,
    target_where: Record<string, any>
) => {
    // the as typeof... on this line is completely unnecessary and is here because typescript is buggy
    const edge_paths = (edge_paths_by_destination[target_entity] ??
        []) as (typeof edge_paths_by_destination)[string]

    // This optimization was not working with multiple edge paths, where an edge path is the higher table,
    // but the higher table is a reverse nest and the edge path also starts with a reverse nest (the higher table)
    // maybe add this back after properly thinking through the implications...
    // // (optimization) if the higher table is the parent table, we dont need to do extra filtering.
    // // This is because orma will already filter this to be a child of the higher table,
    // // so we only need to put the extra where clause on the higher table.
    // // We only check the entity since the column of the foreign key is inferred by orma (there must be only one)
    // const edge_paths = all_edge_paths.filter(
    //     edge_path =>
    //         higher_entity === undefined || // if no higher entity is provided, then skip the optimization
    //         edge_path[0].to_entity !== higher_entity
    // )

    const clauses = edge_paths.map(edge_path => {
        const clause = edge_path_to_where_ins(
            orma_schema,
            edge_path,
            '$where',
            target_where
        )

        return clause
    })

    // if the entity that we are generating the where clause for is the same as the $where_connected entity,
    // then we need to generate an extra where clause, since an entity is always connected to itself,
    // but there is no edge in the connection_edges stating this
    if (target_entity === filtered_entity) {
        clauses.push(target_where)
    }

    return clauses
}

const get_where_not_connected_clauses = (
    orma_schema: OrmaSchema,
    edge_paths_by_destination: ReturnType<typeof get_edge_paths_by_destination>,
    filtered_entity: string,
    target_entity: string
) => {
    // entities are always connected to themself, so a where not connected clause makes
    // no sense if the target entity is also the filtered entity
    if (target_entity === filtered_entity) {
        return []
    }

    // the as typeof... on this line is completely unnecessary and is here because typescript is buggy
    const edge_paths = (edge_paths_by_destination[target_entity] ??
        []) as (typeof edge_paths_by_destination)[string]

    // Basically the where clause checks that there
    // is at least one connected record. But in cases where all edge paths have a nullable (or reverse nested)
    // edge, then there could be NO connected record. In that case, there is not one connected record, but since
    // there are also no non-connected records, we allow it explicitly. Note that this only applies
    // if we are not directly checking the root level (which is why its in the else)

    // take the first edge and uniq them based on all keys
    const first_edges = [
        ...new Set(edge_paths.map(edge_path => JSON.stringify(edge_path[0])))
    ].map(el => JSON.parse(el) as Edge)
    const wheres = first_edges.map(edge => {
        const is_reversed = is_parent_entity(
            edge.from_entity,
            edge.to_entity,
            orma_schema
        )
        const is_nullable =
            !is_reversed &&
            get_field_is_nullable(
                orma_schema,
                edge.from_entity,
                edge.from_field
            )

        if (is_reversed) {
            return {
                $not: edge_to_where_in(orma_schema, edge, '$where', undefined)
            }
        }

        if (is_nullable) {
            return { $eq: [edge.from_field, null] }
        }

        return undefined
    })

    if (wheres.length && wheres.every(where => where !== undefined)) {
        return [combine_wheres(wheres, '$and')]
    } else {
        return []
    }
}

export const get_edge_paths_by_destination = (
    connection_edges: ConnectionEdges,
    source_entity: string
) => {
    // start off with a path to every connected edge
    let edge_paths =
        connection_edges?.[source_entity]?.map(edge => [
            { ...edge, from_entity: source_entity }
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
        const parent_entity = last(edge_path).to_entity
        const new_paths =
            connection_edges?.[parent_entity]
                // filter edges to exclude edges already in this path. Only allowing each edge once per path
                // prevents infinite loops in the connection paths
                ?.filter(connection_edge =>
                    edge_path.every(
                        edge =>
                            edge.from_field !== connection_edge.from_field ||
                            edge.to_entity !== connection_edge.to_entity ||
                            edge.to_field !== connection_edge.to_field
                    )
                )
                // generate a new path by appending the connection edge
                .map(connection_edge => {
                    const new_edge = {
                        ...connection_edge,
                        from_entity: parent_entity
                    }
                    return [...edge_path, new_edge]
                }) ?? []

        edge_paths.push(...new_paths)
    }
    // }

    // split edge paths by entity since we only want paths to entities that are in the $where_connected clause
    const connection_paths = edge_paths.reduce(
        (acc, raw_edge_path) => {
            const target_entity = last(raw_edge_path).to_entity
            if (!acc[target_entity]) {
                acc[target_entity] = []
            }

            // in an edge path, the target entity should only appear once, since target entities
            // are always connected to themselves and only themselves. This means anything
            // after the first instance of the target entity is redundant. This can happen
            // in an edge path like: A -> B -> C -> B, where B is the target entity. So we
            // would remove the B -> C and C -> B edges.
            const first_taget_index = raw_edge_path.findIndex(
                edge => edge.to_entity === target_entity
            )
            const trimmed_edge_path = raw_edge_path.slice(
                0,
                first_taget_index + 1
            )

            // removing part of the edge path can cause there to be duplicates, so check for that
            const edge_path_exists =
                acc[target_entity].find(existing_edge_path =>
                    deep_equal(existing_edge_path, trimmed_edge_path)
                ) !== undefined

            if (!edge_path_exists) {
                acc[target_entity].push(trimmed_edge_path)
            }

            return acc
        },
        {} as {
            [target_entity: string]: Edge[][]
        }
    )

    return connection_paths
}

// TODO: make validation that ensures an entity / field combination cannot appear more than once in a $where_connected

/**
 * Add the given edge and removes the reverse edge if it exists, to prevent infinite loops
 */
export const add_connection_edges = (
    connection_edges: ConnectionEdges,
    new_edges: Edge[]
): ConnectionEdges => {
    // shallow clone to not mutate input
    const new_connection_edges = {
        ...connection_edges
    }

    new_edges.forEach(new_edge => {
        const existing_edges = new_connection_edges[new_edge.from_entity] ?? []

        new_connection_edges[new_edge.from_entity] = [
            ...existing_edges,
            {
                from_field: new_edge.from_field,
                to_entity: new_edge.to_entity,
                to_field: new_edge.to_field
            }
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
        ...connection_edges
    }

    edges_to_remove.forEach(edge_to_remove => {
        if (new_connection_edges[edge_to_remove.from_entity]) {
            // find the edge and exclude it from result
            new_connection_edges[edge_to_remove.from_entity] =
                new_connection_edges[edge_to_remove.from_entity].filter(
                    edge => !deep_equal(edge, edge_to_remove)
                )
        }
    })

    return new_connection_edges
}

/*
This defines the concept of 'connected' for this macro. Each entity gets a list of edges that are considered connected.
Connected paths are generated by traversing all possible paths in these edges. Each connected path then generates a where
clause that filters results to be connected via these connected paths.
 */
export type ConnectionEdges = {
    [source_entity: string]: {
        from_field: string
        to_entity: string
        to_field: string
    }[]
}

/**
 * MUTATES THE INPUT QUERY.
 * Ensures that the where connected are allowable, and generates default where connecteds if there are none. Specifically,
 * generates errors if any where connected has values that are not in the given list of restrictions for that entity and
 * field. If there is no where connected for a restriction, then the entire restriction is added as a where connected.
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
                    (acc, { $entity, $field, $values }) => {
                        if (
                            $entity === where_connected_restriction.$entity &&
                            $field === where_connected_restriction.$field
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
                                where_connected_restriction.$entity
                            } ${
                                where_connected_restriction.$field
                            } ${where_connected_restriction.$values.join(
                                ', '
                            )} but ${forbidden_values} was given.`,
                            path: ['$where_connected'],
                            additional_info: {
                                where_connected_restriction,
                                given_where_connected: query.$where_connected,
                                forbidden_values
                            }
                        }
                    ]
                }
            }

            return []
        }
    )

    return errors
}
