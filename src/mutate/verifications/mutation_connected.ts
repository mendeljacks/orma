import { OrmaError } from '../../helpers/error_handling'
import { group_by } from '../../helpers/helpers'
import { reverse_edge } from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { edge_path_to_where_ins } from '../../query/macros/any_path_macro'
import {
    ConnectionEdges,
    get_edge_paths_by_destination,
} from '../../query/macros/where_connected_macro'
import { combine_wheres } from '../../query/query_helpers'
import { WhereConnected } from '../../types/query/query_types'
import { path_to_entity } from '../helpers/mutate_helpers'
import { generate_record_where_clause } from '../helpers/record_searching'
import { mysql_fn } from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'
import { generate_statement } from '../statement_generation/mutation_statements'

/**
 * @param mutation
 * @param ownership_entity
 * @param ownership_field
 * @param ownership_values allowed values of the ownership_field
 * @param ownership_ignores Objec where keys are entity names and values are arrays of fields.
 * @param query_function function which takes a query and connection and executes the query
 * @param connection
 * @returns
 */
export const get_mutation_connected_errors = async (
    orma_schema: OrmaSchema,
    connection_edges: ConnectionEdges,
    mysql_function: mysql_fn,
    where_connecteds: WhereConnected<OrmaSchema>,
    mutation_pieces: MutationPiece[]
) => {
    const ownership_queries = get_ownership_queries(
        orma_schema,
        connection_edges,
        where_connecteds,
        mutation_pieces
    )

    if (ownership_queries.length === 0) {
        return []
    }

    const ownership_results = await mysql_function(
        ownership_queries.map(ownership_query =>
            generate_statement(ownership_query, [])
        )
    )

    const errors = generate_ownership_errors(
        ownership_results,
        where_connecteds
    )
    return errors
}

export const get_ownership_queries = (
    orma_schema: OrmaSchema,
    connection_edges: ConnectionEdges,
    where_connecteds: WhereConnected<OrmaSchema>,
    all_mutation_pieces: MutationPiece[]
) => {
    /* 
    algorithm:
    
    for each row:
        if the row is itself a vendor and a create:
            disallow it (is this desired behaviour?)
        if the row is itself a vendor and an update or delete:
            just check the row itself in the database

        if row is a create:
            all data is in scope (since it cant already be in the database)
            for each foreign key there are two options:
                1. foreign key refers to something in the mutation. In this case whatever it refers to must also be owned,
                    since it either has already been checked or will be checked (which will generate an error anyway)
                2. foreign key refers to something in the database. In this case we can check if the referenced row is owned
                    using a database query.
        if the row is an update or delete:
            the row already exists in the database. So we need to check two things:
                1. the row it refers to in the database is owned
                2. the foreign keys all refer to owned rows. This is done the same was as for a create

    If any rows are not owned, then the mutation is not owned (note that some rows may not show up as unowned even if they are
    but in those cases, some parent row in the mutation will always show up as unowned instead so the overall ownership of the
    mutation will always be correct)
        
    */

    const mutation_pieces_by_entity = group_by(
        all_mutation_pieces,
        mutation_piece => path_to_entity(mutation_piece.path)
    )
    const entities = Object.keys(mutation_pieces_by_entity)

    const queries = where_connecteds.flatMap(where_connected => {
        const wheres = entities.flatMap(entity => {
            const mutation_pieces = mutation_pieces_by_entity[entity]

            const primary_key_wheres = get_primary_key_wheres(
                orma_schema,
                connection_edges,
                where_connected,
                mutation_pieces,
                entity
            )

            const foreign_key_wheres = get_foreign_key_wheres(
                connection_edges,
                where_connected,
                mutation_pieces,
                entity
            )

            return [...foreign_key_wheres, ...primary_key_wheres]
        })

        const $where = combine_wheres(wheres, '$or')

        if (!$where) {
            return []
        }

        const query = {
            $select: [where_connected.$field],
            $from: where_connected.$entity,
            $where,
        }

        return [query]
    })

    return queries
}

export const get_primary_key_wheres = (
    orma_schema: OrmaSchema,
    connection_edges: ConnectionEdges,
    where_connected: WhereConnected<OrmaSchema>[number],
    mutation_pieces: MutationPiece[],
    entity: string
) => {
    // const primary_keys = get_primary_keys(entity, orma_schema)
    // const primary_key_values = records
    //     .map(record => {
    //         const operation = record.$operation

    //         if (operation === 'update' || operation === 'delete') {
    //             return record[primary_key]
    //         } else {
    //             return undefined
    //         }
    //     })
    //     .filter(el => el !== undefined)

    // if (primary_key_values.length === 0) {
    //     return []
    // }

    // const entity_where = {
    //     in: [primary_key, primary_key_values],
    // }

    const identifying_wheres = mutation_pieces
        // creates dont get identifying wheres since they are not in the database yet
        .filter(
            ({ record }) =>
                record.$operation === 'update' || record.$operation === 'delete'
        )
        .map(
            mutation_pieces =>
                generate_record_where_clause(
                    mutation_pieces,
                    {}, // no values_by_guid since this is a pre middleware
                    orma_schema,
                    // force a value for now - no guid allowed (maybe change this in future when I figure out
                    // what to do in this case)
                    false,
                    true
                )?.where
        )
        .filter(el => el !== undefined)

    // the first case is because if this entity is the ownership entity, then we dont need to wrap in $where $ins.
    // the second case is if there are no identifying keys (e.g. all creates or only $guids)
    if (entity === where_connected.$entity || identifying_wheres.length === 0) {
        // there might be a more elegant way to not handle this case separately, but im not sure how
        return identifying_wheres
    }

    const edge_paths = get_edge_paths_by_destination(connection_edges, entity)

    const primary_key_wheres = edge_paths[where_connected.$entity].map(
        edge_path => {
            // reverse since we are queryng the where connected root entity and these paths are going from the
            // current entity to the root, not the root to the current entity
            const reversed_edge_path = edge_path
                .slice()
                .reverse()
                .map(edge => reverse_edge(edge))

            const where = edge_path_to_where_ins(
                reversed_edge_path,
                '$where',
                combine_wheres(identifying_wheres, '$or')
            )
            return where
        }
    )

    return primary_key_wheres
}

export const get_foreign_key_wheres = (
    connection_edges: ConnectionEdges,
    where_connected: WhereConnected<OrmaSchema>[number],
    mutation_pieces: MutationPiece[],
    entity: string
) => {
    // TODO: optimize by combining this with the one in the other function
    const edge_paths = get_edge_paths_by_destination(connection_edges, entity)

    const foreign_key_wheres = edge_paths[where_connected.$entity]
        .map(edge_path => {
            const values = mutation_pieces
                .map(({ record }) => {
                    const field = edge_path[0].from_field
                    const value = record[field]
                    // ignore any values with a guid since they must refer to something in this mutation,
                    // but that row must belong to us if it passes ownership
                    return value?.$guid === undefined ? value : undefined
                })
                .filter(el => el !== undefined)

            if (values.length === 0) {
                return undefined
            }

            // since this is a foreign key search, we actually want to search on the direct parent instead of the entity itself,
            // for example in a create the entity itself doesnt exist yet but the parent does
            const search_ownership_path = edge_path
                .slice(1, Infinity)
                .reverse()
                .map(edge => reverse_edge(edge))
            const parent_field = edge_path[0].to_field
            const parent_where = {
                $in: [parent_field, values],
            }

            if (search_ownership_path.length === 0) {
                // this happends when the entity is a direct child of the ownership table.
                // we are essentially handling 1-level nesting and deep nesting as separate cases,
                // but there might be a way to do this more elegantly
                return parent_where
            } else {
                const where = edge_path_to_where_ins(
                    search_ownership_path,
                    '$where',
                    parent_where
                )
                return where
            }
        })
        .filter(el => el !== undefined)

    return foreign_key_wheres
}

// const filter_ignored_edge_paths = (
//     nest_paths,
//     ownership_ignores: Record<string, string[]>
// ) => {
//     return nest_paths.filter(nest_path => {
//         // filter out the paths that start with a diffed key
//         const first_entity = nest_path[0].from_table
//         const first_field = nest_path[0].from_key
//         const initial_table_fields = ownership_ignores[first_entity] ?? []
//         return !initial_table_fields.includes(first_field)
//     })
// }

// const ownership_path_to_any_path = (ownership_edge_path, descendant_entity) =>
//     // reversed because the ownership path is descendant table -> ownership table but we
//     // need the other way around to query on the ownership table
//     reverse(ownership_edge_path)
//         // @ts-ignore
//         .map(edge => edge.to_table)
//         // after reversing, we need to cut the first element (the ownership table) and add a last element (the descendant table)
//         // this is just to match the formatting of the any clause, since the ownership path doesnt include the first table
//         .filter((_, i) => i !== 0)
//         .concat([descendant_entity])
//         .join('.')

const generate_ownership_errors = (
    ownership_results: Record<string, any>[][],
    where_connecteds: WhereConnected<OrmaSchema>
) => {
    const errors = where_connecteds.flatMap((where_connected, i) => {
        const owner_objects = ownership_results[i]
        const owners = owner_objects.map(owner => owner[where_connected.$field])
        const valid_owners = new Set(where_connected.$values)
        const invalid_owners = owners.filter(
            owner_value => !valid_owners.has(owner_value)
        )

        if (invalid_owners.length > 0) {
            const error: OrmaError = {
                error_code: 'missing_access_rights',
                message: `Tried to mutate data from ${
                    where_connected.$entity
                } ${owners.join(', ')} but only has permission to modify data from ${
                    where_connected.$entity
                } ${where_connected.$values.join(', ')}.`,
                additional_info: {
                    where_connected,
                    owners,
                    valid_owners,
                    invalid_owners,
                },
            }
            return [error]
        } else {
            return []
        }
    })

    return errors
}
