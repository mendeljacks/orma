import { MutationPiece } from '../plan/mutation_plan'
import { WhereConnected } from '../../types/query/query_types'
import { OrmaSchema } from '../../introspector/introspector'
import { mysql_fn } from '../mutate'
import { group_by } from '../../helpers/helpers'
import { path_to_entity } from '../helpers/mutate_helpers'
import { generate_statement } from '../statement_generation/mutation_statements'
import { get_primary_keys } from '../../helpers/schema_helpers'
import { generate_record_where_clause } from '../helpers/record_searching'
import { ConnectionEdges, get_upwards_connection_edges } from '../../query/macros/where_connected_macro'

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
export const mutation_ownership_check = async (
    orma_schema: OrmaSchema,
    connection_edges: ConnectionEdges,
    mysql_function: mysql_fn,
    mutation_pieces: MutationPiece[],
    where_connected: WhereConnected<OrmaSchema>
) => {
    const ownership_query: any = get_ownership_query(
        mutation,
        ownership_entity,
        ownership_ignores
    )

    if (ownership_query === undefined) {
        return
    }

    ownership_query[ownership_entity].select = [ownership_field]

    const results = await mysql_function(
        generate_statement(ownership_query, [])
    )
    const owners = results?.[ownership_entity] ?? []
    const owner_values = owners.map(owner => owner[ownership_field])
    const invalid_owners = differenceWith(
        (owner, ownership_value) => owner[ownership_field] === ownership_value,
        owners,
        ownership_values
    )

    if (invalid_owners.length > 0) {
        const error = {
            error_code: 'missing_access_rights',
            errors: [
                {
                    message: `Tried to mutate data from ${ownership_entity} ${owner_values} but only has permission to modify data from ${ownership_entity} ${ownership_values}.`,
                    additional_info: {
                        ownership_entity,
                        owners,
                        invalid_owners,
                        permitted_ownership_values: ownership_values,
                    },
                },
            ],
        }
        return error
    }
}

export const get_ownership_query = (
    mutation_pieces: MutationPiece[],
    where_connected: WhereConnected<OrmaSchema>[number],
    ownership_ignores: Record<string, string[]>
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
        mutation_pieces,
        mutation_piece => path_to_entity(mutation_piece.path)
    )
    const entities = Object.keys(mutation_pieces_by_entity)

    const wheres = entities.flatMap(entity => {
        const mutation_pieces = mutation_pieces_by_entity[entity]
        const records = mutation_pieces.map(mutation_piece => {
            const record = mutation_piece.record
            const operation = record.$operation
            if (!operation) {
                throw new Error('No operation provided for record.')
            }

            return record
        })

        const primary_key_wheres = get_primary_key_wheres(
            entity,
            records,
            ownership_entity,
            ownership_ignores
        )
        const foreign_key_wheres = get_foreign_key_wheres(
            entity,
            records,
            ownership_entity,
            ownership_ignores
        )

        return [...foreign_key_wheres, ...primary_key_wheres]
    })

    const $where = combine_wheres(wheres, 'or')

    if (!$where) {
        return undefined
    }

    const query: Record<any, any> = {
        [where_connected.$entity]: {
            [where_connected.$field]: true,
            $where,
        },
    }

    return query
}

function get_primary_key_wheres(
    orma_schema: OrmaSchema,
    ownership_ignores: Record<string, string[]>,
    where_connected: WhereConnected<OrmaSchema>[number],
    mutation_pieces: MutationPiece[],
    entity: string
) {
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

    const identifying_wheres = mutation_pieces.map(mutation_pieces =>
        generate_record_where_clause(mutation_pieces, orma_schema, false)
    )

    if (entity === where_connected.$entity) {
        // there might be a more elegant way to not handle this case separately, but im not sure how
        return identifying_wheres
    }

    const ownership_edge_paths = filter_ignored_edge_paths(
        get_upwards_connection_edges(entity, where_connected.$entity),
        ownership_ignores
    )

    const primary_key_wheres = ownership_edge_paths.map(ownership_edge_path => {
        const any_path = ownership_path_to_any_path(ownership_edge_path, entity)

        return {
            any: [any_path, entity_where],
        }
    })

    return primary_key_wheres
}

const get_foreign_key_wheres = (
    entity: string,
    records: Record<any, any>[],
    ownership_entity: string,
    ownership_ignores: Record<string, string[]>
) => {
    const ownership_edge_paths = filter_ignored_edge_paths(
        get_upwards_nest_paths(entity, ownership_entity, generated_paths),
        ownership_ignores
    )

    const foreign_key_wheres = ownership_edge_paths
        .map(ownership_path => {
            const values = records
                .map(record => {
                    return record[ownership_path[0].from_key]
                })
                .filter(el => el !== undefined)

            if (values.length === 0) {
                return undefined
            }

            // since this is a foreign key search, we actually want to search on the direct parent instead of the entity itself,
            // for example in a create the entity itself doesnt exist yet but the parent does
            const search_ownership_path = ownership_path.slice(1, Infinity)
            const parent_entity = ownership_path[0].to_table
            const parent_field = ownership_path[0].to_key
            const parent_where = {
                in: [parent_field, values],
            }

            if (search_ownership_path.length === 0) {
                // this happends when the entity is a direct child of the ownership table.
                // we are essentially handling 1-level nesting and deep nesting as separate cases,
                // but there might be a way to do this more elegantly
                return parent_where
            } else {
                const any_path = ownership_path_to_any_path(
                    search_ownership_path,
                    parent_entity
                )
                return {
                    any: [any_path, parent_where],
                }
            }
        })
        .filter(el => el !== undefined)

    return foreign_key_wheres
}

const filter_ignored_edge_paths = (
    nest_paths,
    ownership_ignores: Record<string, string[]>
) => {
    return nest_paths.filter(nest_path => {
        // filter out the paths that start with a diffed key
        const first_entity = nest_path[0].from_table
        const first_field = nest_path[0].from_key
        const initial_table_fields = ownership_ignores[first_entity] ?? []
        return !initial_table_fields.includes(first_field)
    })
}

const ownership_path_to_any_path = (ownership_edge_path, descendant_entity) =>
    // reversed because the ownership path is descendant table -> ownership table but we
    // need the other way around to query on the ownership table
    reverse(ownership_edge_path)
        // @ts-ignore
        .map(edge => edge.to_table)
        // after reversing, we need to cut the first element (the ownership table) and add a last element (the descendant table)
        // this is just to match the formatting of the any clause, since the ownership path doesnt include the first table
        .filter((_, i) => i !== 0)
        .concat([descendant_entity])
        .join('.')
