/**
 * Query ownership uses a simple parent/child ownership model.
 *
 *
 *                                  Terminology
 *
 * We can image the database as a graph, with each table being a vertex and each foreign key relationship being an
 * edge. Given two connected tables, we call the referencing table the child and the referenced table the parent.
 * For example, if we have
 *
 * User : { id }
 * Goal : { user_id references id }
 *
 * then User is the parent and Goal is the child.
 *
 *
 * We can then image a prisma query as a subtree of the database graph. It is a subgraph because it can only have existing
 * tables, and they can only be nested when they are connected. It is a tree because JSON objects dont allow cycles. Given two
 * connected tables in the JSON tree, the one which is higher in the JSON is the higher table and the lower one is the lower table.
 * For example, given the query
 *
 * prisma.goals.findMany({
 *   include: {
 *     User: true
 *   }
 * })
 *
 * goals is the higher table and User is the lower table.
 *
 *
 *                                  Ownership model
 *
 * In theory:
 *
 * To figure out ownership of any table row, apply these rules (recursively).
 *
 * Given a user id x (username works too since it is unique)
 * 1. If the table is User, x owns the row if user id == x
 * 2. Otherwise, x owns the row if x owns one of the rows parents
 *
 * For example, user x owns a specific BehaviourEvent if they own the parent Behaviour (rule 2)
 * They own the Behaviour if they own the parent Goal (rule 2)
 * They own the Goal if they own the parent User (rule 2)
 * They own the User if the User id is x (rule 1)
 *
 *
 *
 *
 * In practice:
 *
 * We can add a where clause to a query which ensures any returned rows are a descendant of the given user id.
 * For example, if we can a user id x and we are searching behaviours
 *
 * prisma.behaviours.findMany({
 *   select: {
 *     id: true
 *   }
 * })
 *
 * we would add this where clause
 *
 * prisma.behaviours.findMany({
 *   select: {
 *     id: true
 *   },
 *   where: {
 *     Goal: {
 *       is: {
 *         User: {
 *           is: {
 *             id: { in: [x]}
 *           }
 *         }
 *       }
 *     }
 *   }
 * })
 *
 * we add similar where clauses recursively for any nested elements in the query.
 *
 *
 *
 * Optimization:
 *
 * If a lower table is also the child of the higher table, we dont need to add the where clause to the lower table.
 * This is because the higher table is already restricted to be a descendant of the correct User (we are assuming it has
 * the extra where clause). Also, by the nature of prisma queries, anything in the lower table must be connected (parent or child)
 * to the higher table. Since in this case the lower table is a child of the higher table, that means it must also be a descendant
 * of the correct user. So we dont need to add an extra where clause on the user.
 *
 * For example:
 *
 * prisma.goals.findMany({
 *   select: {
 *     goalBehaviours: {
 *       // <-- goalBehaviours doesnt need an ownership where clause, since prisma guarantees that it is a child of a selected goal,
 *       // and all selected goals are owned by the user (since goals has the ownership where clause)
 *     }
 *   }
 *   // <-- goals needs an ownership where clause
 * })
 *
 * @module
 */

import { deep_set, last } from '../../helpers/helpers'
import { push_path } from '../../helpers/push_path'
import {
    Edge,
    get_entity_names,
    get_parent_edges,
} from '../../helpers/schema_helpers'
import { orma_schema } from '../../introspector/introspector'
import { WhereConnected } from '../../types/query/query_types'
import { GetAllEntities, OrmaSchema } from '../../types/schema_types'
import { combine_wheres, query_for_each } from '../query_helpers'
import { edge_path_to_where_ins, process_any_clause } from './any_path_macro'

/*
This defines the concept of 'connected' for this macro. Each entity gets a list of paths that are considered connected.
For each of these paths, where clauses will be generated.
 */
export type ConnectionPaths = {
    [source_entity: string]: {
        [destination_entity: string]: Edge[][]
    }
}

/*
 A path refers to a location in an object. For example 
 path = ['a', 0, 'b']
 object = {
     a: [{
         b: 'test'
     }]
 }
 the path in object refers to the string 'test'.
 */
export type Path = (string | number)[]

export const get_upwards_connection_paths = (orma_schema: orma_schema) => {
    const connection_paths = get_entity_names(orma_schema).reduce(
        (acc, entity_name) => {

            // start off with a path to every parent
            const entity_paths = get_parent_edges(entity_name, orma_schema).map(
                edge => [edge]
            )

            // every path before this index is done, in other words there are no more paths that we can get
            // by appending some parent edge onto that path
            let next_index = 0

            // keep looping while there are still paths to process
            while (next_index < entity_paths.length) {
                const current_index = next_index
                next_index = entity_paths.length
                for (let i = current_index; i < entity_paths.length; i++) {
                    // for each unprocessed path, generate new paths by appending all possible 
                    // parent edges onto its end
                    const entity_path = entity_paths[i]
                    const parent_entity = last(entity_path).to_entity
                    const new_paths = get_parent_edges(
                        parent_entity,
                        orma_schema
                    ).map(new_edge => [...entity_path, new_edge])

                    entity_paths.push(...new_paths)
                }
            }

            entity_paths.forEach(entity_path => {
                const target_entity = last(entity_path).to_entity
                push_path([entity_name, target_entity], entity_path, acc)
            })

            return acc
        },
        {} as ConnectionPaths
    )

    return connection_paths
}

export const apply_where_connected_macro = (
    query: Record<string, any>,
    connection_paths: ConnectionPaths
) => {
    if (!query.$where_connected) {
        return
    }

    query_for_each(query, (subquery, path) => {
        const existing_wheres = [subquery.$where] ?? []
        const connected_where = get_connected_where_clause(connection_paths, query.$where_connected, path)
        const new_where = combine_wheres([...existing_wheres, connected_where], '$and')
        
        subquery.$where = new_where
    })

    return query
}

const get_connected_where_clause = (connection_paths: ConnectionPaths, $where_connected: WhereConnected<OrmaSchema>, query_path: string[]) => {
    const entity_name = last(query_path)
    
    const connection_clauses = $where_connected.flatMap(({ $entity, $field, $values}) => {
        const edge_paths = connection_paths?.[entity_name]?.[$entity] ?? []

        if (edge_paths.length === 0) {
            return []
        }

        const clauses = edge_paths.map(edge_path => {
            const clause = edge_path_to_where_ins(edge_path, '$where', {
                $in: [$field, $values]
            })

            return clause
        })

        return clauses
    })

    return combine_wheres(connection_clauses, '$and')
}

// /**
//  * Recursively adds ownership clauses to the given prisma query, as discussed in the module comment.
//  * @param root_table Prisma root table, for example prisma.users has root table 'users'
//  * @param ownership_paths ownership paths as discussed here {@link ConnectionPaths}
//  * @param owner_column the column in the owner table which we are checking ownership against. For example, 'username'
//  * @param owner_values the owner values we want to restrict results to. For example 'john@gmail.com'
//  * @returns A copy of the prisma query with ownership clauses
//  */
// export const add_query_ownership_clauses = (
//     root_table: string,
//     ownership_paths: ConnectionPaths,
//     root_ownership_paths: ConnectionPaths,
//     owner_column: string,
//     owner_values: any[],
//     prisma_query: Record<string, unknown>
// ) => {
//     const mapped_prisma_query = deep_map(prisma_query, (value, path) => {
//         const table_name = last(path)?.toString()
//         // deep map will be called on keys that are not tables, for example 'select' or 'where'. For these keys, do nothing
//         if (!table_name || !is_table_name(table_name, ownership_paths)) {
//             return value
//         }

//         const ownership_path = get_ownership_path(ownership_paths, table_name)

//         // This is basically to hack around the fact that prisma syntax doesnt allow
//         // where clauses on nested parent tables
//         if (ownership_path === null) {
//             return value
//         }

//         const parent_table = first(ownership_path)
//         const higher_table =
//             findLast(
//                 dropRight(path, 1), // exclude current table, otherwise higher_table will always equal the current table
//                 el => is_table_name(el, ownership_paths) // only look for keys in the path that are table names. E.g. exclude 'where' or 'select'
//             ) ?? root_table // if nothing is found, that means we are the child of the root table, so use that as the higher table

//         // (optimization) if the higher table is the parent table, we dont need to do extra filtering. This is because prisma will already filter
//         // this to be a child of the higher table, so we only need to put the extra where clause on the higher table
//         if (parent_table === higher_table) {
//             return value
//         }

//         const ownership_where = generate_ownership_where(
//             ownership_path,
//             owner_column,
//             owner_values
//         )

//         // there might already be a where clause, but we dont want to lose that. So we combine the existing (if any)
//         // clause with the ownership clause
//         const combined_where = combine_wheres(
//             [value.where, ownership_where],
//             'AND'
//         )

//         // value could be true, since prisma allows nested selects like { goals: true } to select all columns on goals
//         return typeof value === 'object'
//             ? { ...value, where: combined_where }
//             : { where: combined_where }
//     })

//     // prisma syntax treats the root table differently than all other tables (as in it is a method name, and not a property of
//     // 'select' or 'includes' like other nested tables), so we need to handle it separetely. But the logic is exactly the same.
//     const root_ownership_path = get_ownership_path(
//         root_ownership_paths,
//         root_table
//     )
//     const root_where = generate_ownership_where(
//         root_ownership_path,
//         owner_column,
//         owner_values
//     )
//     const combined_root_where = combine_wheres(
//         [root_where, prisma_query.where],
//         'AND'
//     )

//     return {
//         ...mapped_prisma_query,
//         where: combined_root_where,
//     }
// }

// /**
//  * Gets the ownership path for a given table. Throws an error if it is not found (For security reasons, we need to ensure
//  * no one forgot to make an ownership route)
//  */
// export const get_ownership_path = (
//     ownership_paths: ConnectionPaths,
//     table_name: string
// ) => {
//     if (ownership_paths[table_name] !== undefined) {
//         return ownership_paths[table_name]
//     }

//     throw new Error(`Could not find ownership path for table ${table_name}.`)
// }

// /**
//  * Returns true if the table_name is a key of the ownership_paths
//  */
// export const is_table_name = (
//     table_name: string | number,
//     ownership_paths: ConnectionPaths
// ) => {
//     return Object.keys(ownership_paths).includes(table_name?.toString())
// }

// /**
//  * Generates a single ownership where clause. ownership paths should all point to the same entity
//  */
// const generate_ownership_where = (
//     ownership_paths: Edge[][],
//     owner_field: string,
//     owner_values: any[]
// ) => {
//     const clauses = ownership_paths.map(ownership_path => {

//         if (owner_column === last(ownership_path).to_field) {

//         }
//     })


//     const inner_where = {
//         [owner_column]: {
//             in: owner_values,
//         },
//     } as Record<string, unknown>

//     // we will build the where clause from the bottom up, starting with the end of the ownership path and working to the beginning.
//     // the .slice() makes a copy so that .reverse() doesnt mutate the original
//     const ownership_where = ownership_path
//         .slice()
//         .reverse()
//         .reduce((where, table_name) => {
//             return {
//                 [table_name]: {
//                     is: where,
//                 },
//             }
//         }, inner_where)

//     return ownership_where
// }


/*

{
    $where_connected: {
        vendors: {
            id: [1, 2]
        }
    }
}

{
    $where_connected: [
        ['vendors', 'id', [1, 2]]
    ]
}

{
    $any_path: [['variants', 'images'], {
        $eq: [...]
    }]
}

{
    $any_path: {
        $path: ['variants', 'images'],
        $path_where: {

        }
    }
}

{
    $where_connected: [
        {
            $entity: 'vendors',
            $field: 'id',
            $values: [1, 2]
        }
    ]
}


*/

// TODO: make validation that ensures an entity / field combination cannot appear more than once in a $where_connected