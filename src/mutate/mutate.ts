import { orma_escape } from '../helpers/escape'
import { array_equals, clone, deep_get, key_by, last } from '../helpers/helpers'
import {
    get_child_edges,
    get_primary_keys,
    get_unique_field_groups,
} from '../helpers/schema_helpers'
import { string_to_path } from '../helpers/string_to_path'
import { OrmaSchema } from '../introspector/introspector'
import { json_to_sql } from '../query/json_sql'
import { combine_wheres } from '../query/query_helpers'
import { apply_guid_macro, GuidByPath, PathsByGuid } from './macros/guid_macro'
import { apply_inherit_operations_macro } from './macros/inherit_operations_macro'
import {
    get_create_ast,
    get_delete_ast,
    get_foreign_keys_obj,
    get_guid_obj,
    get_update_asts,
    throw_identifying_key_errors,
} from './macros/operation_macros'
import { mutation_entity_deep_for_each } from './helpers/mutate_helpers'
import { get_mutate_plan } from './plan/mutate_plan'
import { add_foreign_key_indexes } from './helpers/add_foreign_key_indexes'

export type operation = 'create' | 'update' | 'delete' | 'query'
export type mysql_fn = (statements) => Promise<Record<string, any>[][]>
export type statements = {
    sql_ast: Record<any, any>
    sql_string: string
    route: string[]
    operation: operation
    paths: (string | number)[][]
}[]
export const orma_mutate = async (
    input_mutation,
    mysql_function: mysql_fn,
    orma_schema: OrmaSchema
) => {
    // clone to allow macros to mutation the mutation without changing the user input mutation object
    const mutation = clone(input_mutation)

    apply_inherit_operations_macro(mutation)
    const { guid_by_path, paths_by_guid } = apply_guid_macro(mutation)
    // [[{"operation":"create","paths":[...]]}],[{"operation":"create","paths":[...]}]]
    const mutate_plan = get_mutate_plan(mutation, orma_schema)

    let db_row_by_path = {
        // Will be built up as each phase of the mutate_plan is executed
        // [path]: {...}
    }

    for (let i = 0; i < mutate_plan.length; i++) {
        const planned_statements = mutate_plan[i]

        const mutation_statements: statements = planned_statements.flatMap(
            ({ operation, paths, route }) => {
                const entity_name: string = last(route)
                const statements = get_mutation_statements(
                    operation,
                    entity_name,
                    paths,
                    mutation,
                    db_row_by_path,
                    orma_schema,
                    guid_by_path,
                    paths_by_guid
                )
                return statements.map(statement => ({
                    ...statement,
                    sql_string: json_to_sql(statement.sql_ast),
                    route,
                    operation,
                }))
            }
        )

        await mysql_function(mutation_statements)

        const query_statements: statements = planned_statements
            // we only need to do foreign key propagation for creates
            .filter(({ operation }) => operation === 'create')
            .map(({ paths, route }) => {
                const sql_ast = generate_foreign_key_query(
                    mutation,
                    last(route),
                    paths,
                    orma_schema
                )

                // sql ast can be undefined if there are no foreign keys to search for on this entity
                if (sql_ast === undefined) {
                    return undefined
                } else {
                    return {
                        sql_ast,
                        sql_string: json_to_sql(sql_ast),
                        route,
                        operation: 'query' as operation,
                        paths,
                    }
                }
            })
            .filter(el => el !== undefined)

        if (query_statements.length > 0) {
            const query_results = await mysql_function(query_statements)

            const new_db_row_by_path = add_foreign_key_indexes(
                query_statements,
                query_results,
                mutation,
                orma_schema
            )

            db_row_by_path = {
                ...db_row_by_path,
                ...new_db_row_by_path,
            }
        }
    }

    // merge database rows into mutation
    Object.entries(db_row_by_path).forEach(([path_string, database_row]) => {
        const path = string_to_path(path_string)
        const mutation_obj = deep_get(path, mutation, undefined)

        // merge database row
        Object.keys(database_row).forEach(key => {
            mutation_obj[key] = database_row[key]
        })
    })

    // merge foreign keys into mutation
    mutation_entity_deep_for_each(mutation, (record, path, entity_name) => {
        const foreign_key_obj = get_foreign_keys_obj(
            mutation,
            path,
            db_row_by_path,
            orma_schema
        )
        const guid_obj = get_guid_obj(
            mutation,
            path,
            db_row_by_path,
            orma_schema,
            guid_by_path,
            paths_by_guid
        )
        let db_obj = { ...foreign_key_obj, ...guid_obj }

        Object.keys(db_obj).forEach(key => {
            record[key] = db_obj[key]
        })
    })

    // merge foreign keys into mutation

    // })
    // const mutation_response = Object.entries(db_row_by_path).reduce(
    //     (acc, [path_string, database_row]: [string, {}], i) => {
    //         const path = string_to_path(path_string)
    //         const mutation_record_with_foreign_keys =
    //             get_record_with_foreign_keys(
    //                 mutation,
    //                 path,
    //                 db_row_by_path,
    //                 orma_schema
    //             )
    //         const merged = deep_merge(mutation_record_with_foreign_keys, database_row)
    //         deep_set(path, merged, acc)
    //         return acc
    //     },
    //     {}
    // )
    return mutation as any
}

/**
 * Generates a query that selects the foreign keys and identifying fields, with where clauses per record based on the
 * identifying fields in the given records. If there are no foreign keys, returns undefined
 */
export const generate_foreign_key_query = (
    mutation,
    entity_name: string,
    paths: (string | number)[][],
    orma_schema: OrmaSchema
) => {
    const foreign_keys = [
        ...new Set(
            get_child_edges(entity_name, orma_schema).map(
                edge => edge.from_field
            )
        ),
    ]

    if (foreign_keys.length === 0) {
        return undefined
    }

    const all_identifying_keys = new Set<string>()

    const wheres = paths.map(path => {
        const record = deep_get(path, mutation, undefined)
        const identifying_keys = get_identifying_keys(
            entity_name,
            record,
            orma_schema
        )
        throw_identifying_key_errors(
            record.$operation,
            identifying_keys,
            path,
            mutation
        )

        identifying_keys.forEach(field => all_identifying_keys.add(field))

        const where = generate_record_where_clause(identifying_keys, record)
        return where
    })

    const $where = combine_wheres(wheres, '$or')

    // foreign keys are needed for foreign key propagation while identifying keys are just needed to match up\
    // database rows with mutation rows later on
    const fields = [...foreign_keys, ...all_identifying_keys].flat()
    const query = {
        $select: fields,
        $from: entity_name,
        $where,
    }

    return query
}

/* 

1. 
{
    products: [{
        <- fill this in later
        variants: [{
            <- insert here first
        }]
    }]
}

Let D be depth
O(D) read/write. Done per record
we need this though because we need to get all the children
but we need to make sure we dont leave holes...? Query plan should prevent that
*/

/**
 * Each given path should point to a record in the mutation.
 * All these records must have the same operation and the same entity. They dont all need an $operation prop
 * (if they have inherited operation), but the same operation will be done on all of them.
 * For this to work, all required foreign keys must have already been inserted (for creates)
 */
export const get_mutation_statements = (
    operation: string,
    entity_name: string,
    paths: (string | number)[][],
    mutation,
    db_row_by_path,
    orma_schema: OrmaSchema,
    guid_by_path: GuidByPath,
    paths_by_guid: PathsByGuid
): { sql_ast: Record<any, any>; paths: (string | number)[][] }[] => {
    let statements: ReturnType<typeof get_mutation_statements>

    if (operation === 'update') {
        statements = get_update_asts(
            entity_name,
            paths,
            mutation,
            orma_schema
        ).map((ast, i) => ({
            paths: [paths[i]],
            sql_ast: ast,
        }))
    } else if (operation === 'delete') {
        statements = [
            {
                sql_ast: get_delete_ast(
                    entity_name,
                    paths,
                    mutation,
                    orma_schema
                ),
                paths,
            },
        ]
    } else if (operation === 'create') {
        statements = [
            {
                sql_ast: get_create_ast(
                    entity_name,
                    paths,
                    mutation,
                    db_row_by_path,
                    orma_schema,
                    guid_by_path,
                    paths_by_guid
                ),
                paths,
            },
        ]
    } else {
        throw new Error(`Invalid operation ${operation}`)
    }

    return statements
}

// /**
//  * Get a list of foreign keys required from a record in the mutation. This is basically the foreign keys of all connected
//  * parent entities in the mutation
//  */
// const get_record_foreign_keys = (
//     mutation,
//     record_path: (string | number)[],
//     orma_schema: orma_schema
// ) => {
//     const entity_name = path_to_entity(record_path)
//     const record = deep_get(record_path, mutation)

//     // get a list of the above path, as well as any below paths.
//     // Some of these might by parents and some might be children.
//     const above_path = drop_last(2, record_path)
//     const below_paths = Object.keys(record)
//         .filter(key => Array.isArray(record[key]))
//         .map(key => [...record_path, key, 0])
//     const all_paths = [above_path, ...below_paths]

//     // now we will get foreign keys for all the paths that are parent paths (ignoring child paths) and
//     // put the foreign keys in an object of { [foreign_key_name]: foreign_key_value}
//     // this object is in the right format to spread into the current record
//     const foreign_keys = all_paths
//         .map(parent_path => {
//             const parent_entity_name = parent_path?.[parent_path.length - 2]
//             // dont do anything for the child paths (foreign keys only come from parents by definition)
//             if (
//                 !is_parent_entity(parent_entity_name, entity_name, orma_schema)
//             ) {
//                 return undefined
//             }

//             // assuming the thing is a parent, we need exactly one edge from the current entity to the parent
//             // (since the syntax has no way to specify which foreign key to use in that case).
//             // This function throws an error if there is not exactly one edge
//             const edge = get_direct_edge(
//                 entity_name,
//                 parent_entity_name,
//                 orma_schema
//             )

//             return edge.from_field
//         })
//         .filter(el => el !== undefined)

//     return foreign_keys
// }

export const generate_record_where_clause = (
    identifying_keys: string[],
    record: Record<string, unknown>
) => {
    const where_clauses = identifying_keys.map(key => ({
        $eq: [key, orma_escape(record[key])],
    }))

    const where =
        where_clauses.length > 1
            ? {
                  $and: where_clauses,
              }
            : where_clauses?.[0]

    return where
}

export const path_to_entity = (path: (number | string)[]) => {
    return typeof last(path) === 'number'
        ? (path[path.length - 2] as string)
        : (last(path) as string)
}

export const get_identifying_keys = (
    entity_name: string,
    record: Record<string, any>,
    orma_schema: OrmaSchema
): string[] => {
    const primary_keys = get_primary_keys(entity_name, orma_schema)
    const has_primary_keys = primary_keys.every(
        primary_key => record[primary_key] !== undefined
    )
    if (has_primary_keys && primary_keys.length > 0) {
        return primary_keys
    }

    // we filter out nullable unique columns, since then there might be multiple records
    // all having null so that column wouldnt uniquely identify a record
    const unique_field_groups = get_unique_field_groups(
        entity_name,
        true,
        orma_schema
    )
    const included_unique_keys = unique_field_groups.filter(unique_fields =>
        unique_fields.every(field => record[field] !== undefined)
    )
    if (included_unique_keys.length === 1) {
        // if there are 2 or more unique keys, we cant use them since it would be ambiguous which we choose
        return included_unique_keys[0] as string[]
    }

    return []
}
