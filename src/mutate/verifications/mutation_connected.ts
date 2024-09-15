import { OrmaError } from '../../helpers/error_handling'
import { group_by } from '../../helpers/helpers'
import { reverse_edge } from '../../helpers/schema_helpers'
import { edge_path_to_where_ins } from '../../query/macros/any_path_macro'
import { apply_escape_macro_to_query_part } from '../../query/macros/escaping_macros'
import {
    ConnectionEdges,
    get_edge_paths_by_destination
} from '../../query/macros/where_connected_macro'
import { combine_wheres } from '../../query/query_helpers'
import { WhereConnected } from '../../types/query/query_types'
import { OrmaSchema } from '../../schema/schema_types'
import { path_to_table } from '../helpers/mutate_helpers'
import { get_identifying_where } from '../helpers/record_searching'
import { GuidMap } from '../macros/guid_plan_macro'
import { MysqlFunction } from '../mutate'
import { MutationPiece } from '../plan/mutation_batches'
import { generate_statement } from '../statement_generation/mutation_statements'

export const get_mutation_connected_errors = async (
    orma_schema: OrmaSchema,
    connection_edges: ConnectionEdges,
    mysql_function: MysqlFunction,
    guid_map: GuidMap,
    where_connecteds: WhereConnected<OrmaSchema>,
    mutation_pieces: MutationPiece[]
) => {
    const ownership_queries = get_ownership_queries(
        orma_schema,
        connection_edges,
        guid_map,
        where_connecteds,
        mutation_pieces
    )

    if (ownership_queries.length === 0) {
        return []
    }

    const ownership_results = await mysql_function(
        ownership_queries.map(ownership_query => {
            const table = ownership_query.$from
            const database_type = orma_schema.tables[table].database_type
            return generate_statement(ownership_query, [], [], database_type)
        })
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
    guid_map: GuidMap,
    where_connecteds: WhereConnected<OrmaSchema>,
    mutation_pieces: MutationPiece[]
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

    const piece_indices_by_table = group_by(
        mutation_pieces.map((_, i) => i),
        i => path_to_table(mutation_pieces[i].path)
    )
    const tables = Object.keys(piece_indices_by_table)

    const queries = where_connecteds.flatMap(where_connected => {
        const wheres = tables.flatMap(table => {
            const piece_indices = piece_indices_by_table[table]

            const primary_key_wheres = get_identifier_connected_wheres(
                orma_schema,
                connection_edges,
                guid_map,
                where_connected,
                mutation_pieces,
                piece_indices,
                table
            )

            const foreign_key_wheres = get_foreign_key_connected_wheres(
                connection_edges,
                where_connected,
                mutation_pieces,
                piece_indices,
                table
            )

            return [...foreign_key_wheres, ...primary_key_wheres]
        })

        const $where = combine_wheres(wheres, '$or')

        if (!$where) {
            return []
        }

        const query = {
            $select: [where_connected.$column],
            $from: where_connected.$table,
            $where
        }

        return [query]
    })

    return queries
}

export const get_identifier_connected_wheres = (
    orma_schema: OrmaSchema,
    connection_edges: ConnectionEdges,
    guid_map: GuidMap,
    where_connected: WhereConnected<OrmaSchema>[number],
    mutation_pieces: MutationPiece[],
    piece_indices: number[],
    table: string
) => {
    const relevant_piece_indices = piece_indices.flatMap(piece_index => {
        // this query fetches data that is in the database but not in the mutation. Because creates
        // are not yet in the database, all data must be in scope already, so we can safely ignore them
        const is_create =
            mutation_pieces[piece_index].record.$operation === 'create'

        const is_none =
            mutation_pieces[piece_index].record.$operation === 'none'

        return is_create || is_none ? [] : [piece_index]
    })
    const identifying_where = get_identifying_where(
        orma_schema,
        guid_map,
        mutation_pieces,
        relevant_piece_indices
    )
    // must apply escape macro since we need valid SQL AST
    apply_escape_macro_to_query_part(orma_schema, table, identifying_where)

    // if this table is the ownership table, then we dont need to wrap in $where $ins.
    if (table === where_connected.$table) {
        // there might be a more elegant way to not handle this case separately, but im not sure how
        return [identifying_where]
    }
    // return early if there are no identifying keys (e.g. all creates or only $guids)
    if (!identifying_where) {
        return []
    }

    const edge_paths_obj = get_edge_paths_by_destination(
        connection_edges,
        table
    )

    const edge_paths = edge_paths_obj[where_connected.$table]
    const primary_key_wheres =
        edge_paths?.map(edge_path => {
            // reverse since we are queryng the where connected root table and these paths are going from the
            // current table to the root, not the root to the current table
            const reversed_edge_path = edge_path
                .slice()
                .reverse()
                .map(edge => reverse_edge(edge))

            const where = edge_path_to_where_ins(
                reversed_edge_path,
                '$where',
                identifying_where
            )
            return where
        }) ?? []

    return primary_key_wheres
}

export const get_foreign_key_connected_wheres = (
    connection_edges: ConnectionEdges,
    where_connected: WhereConnected<OrmaSchema>[number],
    mutation_pieces: MutationPiece[],
    piece_indices: number[],
    table: string
) => {
    // TODO: optimize by combining this with the one in the other function
    const edge_paths_obj = get_edge_paths_by_destination(
        connection_edges,
        table
    )

    const edge_paths = edge_paths_obj[where_connected.$table] ?? []
    const foreign_key_wheres = edge_paths
        .map(edge_path => {
            const values = piece_indices
                .map(piece_index => {
                    const { record } = mutation_pieces[piece_index]
                    const column = edge_path[0].from_columns
                    const value = record[column]
                    // ignore any values with a guid since they must refer to something in this mutation,
                    // but that row must belong to us if it passes ownership
                    return value?.$guid === undefined ? value : undefined
                })
                .filter(el => el !== undefined)

            if (values.length === 0) {
                return undefined
            }

            // since this is a foreign key search, we actually want to search on the direct parent instead of the table itself,
            // for example in a create the table itself doesnt exist yet but the parent does
            const search_ownership_path = edge_path
                .slice(1, Infinity)
                .reverse()
                .map(edge => reverse_edge(edge))
            const parent_column = edge_path[0].to_columns
            const parent_where = {
                $in: [parent_column, values]
            }

            if (search_ownership_path.length === 0) {
                // this happends when the table is a direct child of the ownership table.
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

const generate_ownership_errors = (
    ownership_results: Record<string, any>[][],
    where_connecteds: WhereConnected<OrmaSchema>
) => {
    const errors = where_connecteds.flatMap((where_connected, i) => {
        const owner_objects = ownership_results[i]
        const owners = owner_objects.map(owner => owner[where_connected.$column])
        const valid_owners = new Set(where_connected.$values)
        const invalid_owners = owners.filter(
            owner_value => !valid_owners.has(owner_value)
        )

        if (invalid_owners.length > 0) {
            const error: OrmaError = {
                error_code: 'missing_access_rights',
                message: `Tried to mutate data from ${
                    where_connected.$table
                } ${owners.join(
                    ', '
                )} but only has permission to modify data from ${
                    where_connected.$table
                } ${where_connected.$values.join(', ')}.`,
                additional_info: {
                    where_connected,
                    owners,
                    valid_owners,
                    invalid_owners
                }
            }
            return [error]
        } else {
            return []
        }
    })

    return errors
}

/*

delete post:
{
    $operation: 'delete',
    id: 1,
    group_id: { $write_guid: 'a' }
} 

delete group:
{
    $operation: 'delete',
    id: { $read_guid: 'a' },
} 

in this case, we can't check whether the group is allowed to be deleted or not. Just because the
post is owned, doesn't mean the group is also owned, so we have to throw an error for now (I think the
way to handle this properly might be to do a where in to check the group is allowed, based on the post?)

-- another thing, if it were


delete group:
{
    $operation: 'delete',
    id: 1
} 

delete post:
{
    $operation: 'delete',
} 

this would become
{
    $operation: 'delete',
    group_id: 1
} 

which would delete a bunch of posts. Do some tests to figure out what happens in this case. Would it
throw an error, since there is no unique column?
*/
