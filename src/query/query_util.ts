// import { append, clone, drop, equals, findIndex, has, includes, isEmpty, isNil, keys, last, mergeAll, nth, omit, path, prepend, prop, reverse, slice, split, startsWith, type, uniq } from 'ramda'
// import { assoc_path_mutate, force_array } from "../helpers"
// import { mysql } from "../mysql"
// import { json_to_sql, parse_json_query } from "./json_to_sql"
// import { get_all_table_names, get_edge, get_nest_path, get_possible_edges, get_primary_key_name } from "../traversal2"

// /*
// Terminology used in this file:

// query:          a json object representing a query that the read util support. Can have non-sql commands such as any, 
//                     and certain syntax requirements may be different to sql. See the schema file for a full list of supported commands
// sql_query:      a json object representing a query that can be mapped directly to a sql string. Can't have commands such as any
// child/parent:   refers to how the tables are nested in the database
// higher/lower:   refers to how the tables are nested in the json

// */


// export const query_to_sql_query = (table_infos, search) => {
//     const query = clone(search) // clone so we can mutate query without worrying

//     const routes = get_included_routes(table_infos, search)
//     for (const route of routes) {
//         const table_name = last(route)
//         const higher_table = route.length > 1
//             ? nth(-2, route)
//             : undefined

//         const subquery = path(route, query)

//         const possible_edge_tables = get_possible_edges(table_name, table_infos)
//             .map(prop('to_table'))

//         const lower_tables = keys(subquery)
//             .filter(key => {
//                 const is_table_name = includes(key, possible_edge_tables)
//                 const has_from_clause = has('from', subquery[key])

//                 return is_table_name || has_from_clause
//             })

//         const new_select = convert_query_select(
//             table_infos,
//             subquery.select,
//             subquery.group_by,
//             table_name,
//             higher_table,
//             lower_tables
//         )

//         let new_where = subquery.where
//         if (new_where !== undefined) {
//             new_where = convert_search_where(table_infos, new_where, table_name, false)
//         }

//         let new_having = subquery.having
//         if (new_having !== undefined) {
//             new_having = convert_search_where(table_infos, new_having, table_name, true)
//         }

//         subquery.from = last(route)

//         assoc_path_mutate([...route, 'select'], new_select, query)
//         if (new_where !== undefined) {
//             assoc_path_mutate([...route, 'where'], new_where, query)
//         }
//         if (new_having !== undefined) {
//             assoc_path_mutate([...route, 'having'], new_having, query)
//         }
//     }

//     return query
// }

// const convert_search_where = (table_infos, where, table_name, is_having) => {
//     const lookup_table = {
//         any: args => {
//             const tables = [table_name].concat(args[0].split('.'))
//             const nest_path = get_nest_path(tables, table_infos)
//             return parse_any(nest_path, args[1], is_having)
//         }
//     }

//     const new_where = parse_json_query(where, lookup_table, mergeAll, false)

//     return new_where
// }

// const convert_query_select = (table_infos, select, group_by, table_name, higher_table, lower_tables) => {
//     if (select === undefined) {
//         return `${table_name}.*`
//     }

//     const array_select = force_array(select)

//     const array_group_by = force_array(group_by || [])

//     if (includes('*', array_select)) {
//         // if select has a star, just give the star and any aggregate fields
//         const new_select = array_select
//             .filter(el => type(el) === 'Object')
//             .concat(array_group_by.length > 0 ? array_group_by : `${table_name}.*`) // if there is a group by, we cant select star. we can only select group_by fields

//         return new_select
//     }


//     const foreign_keys = get_possible_edges(table_name, table_infos)
//         .filter(connection =>
//             includes(connection.to_table, lower_tables) // connection can lead to a queried child (or joined parent)
//             || connection.to_table === higher_table // or connection can lead to the parent
//         )
//         .map(prop('from_key')) // pull out the foreign key from these connections
//         .concat(get_primary_key_name(table_name, table_infos))
//         .filter(column_name => {
//             // if there is a group by, we can only nest on tables that have been grouped, 
//             // as these are the only foreign keys that we can select. So no need to add such foreign keys
//             if (group_by !== undefined) {
//                 return includes(column_name, array_group_by)
//             } else {
//                 return true
//             }
//         })

//     if (foreign_keys.length === 0) {
//         return select
//     }

//     const new_select = uniq([...array_select, ...foreign_keys])

//     return new_select
// }

// export const parse_any = (nest_path, end_query, is_having) => {
//     let query = end_query
//     for (let i = nest_path.length - 1; i >= 0; i--) {
//         const link = nest_path[i]
//         query = {
//             in: [link.from_key, {
//                 select: link.to_key,
//                 from: link.to_table,
//                 [is_having ? 'having' : 'where']: query
//             }]
//         }
//     }

//     return query
// }


// // gets a list of all routes in the query. Routes are arrays of table names corresponding 
// // to the path of a nested query
// // root level query_table is undefined, because there is no select, from, etc. i.e., it is not actually a query
// export const get_included_routes = (table_infos, query, query_table = undefined) => {
//     const is_root = query_table === undefined

//     const possible_child_tables = is_root
//         ? get_all_table_names(table_infos)
//         : get_possible_edges(query_table, table_infos)
//             .map(prop('to_table'))

//     const child_tables = possible_child_tables.filter(child_table => has(child_table, query))

//     const descendant_routes = child_tables
//         .flatMap(child_table => {
//             const child_routes = get_included_routes(table_infos, query[child_table], child_table)
//                 .map(prepend(child_table))
//             return prepend([child_table], child_routes)
//         })

//     return [...descendant_routes]
// }


// // gives a query that contains both queries combined with the either 'and' or 'or'. 
// // Prevents combine_with duplication if one of the qureies, for instance, already has an and clause
// export const combine_wheres = (where1, where2, combine_with) => {
//     if (!includes(combine_with, ['and', 'or'])) {
//         throw Error('Can only combine using \'and\' or \'or\'')
//     }

//     if (isNil(where1) || isEmpty(where1)) {
//         return where2
//     }

//     if (isNil(where2) || isEmpty(where2)) {
//         return where1
//     }

//     if (has(combine_with, where1)) {
//         const combined_query = clone(where1)
//         combined_query[combine_with].push(where2)
//         return combined_query
//     }

//     if (has(combine_with, where2)) {
//         const combined_query = clone(where2)
//         combined_query[combine_with].push(where1)
//         return combined_query
//     }

//     const combined_query = {
//         [combine_with]: [where1, where2]
//     }

//     return combined_query
// }

// // sets fields based on select for the whole result object. This function mutates the input obj
// const set_object_keys_by_select = (obj, search) => {

//     const lower_table_keys = keys(obj).filter(key =>
//         type(obj[key]) === 'Array'
//     )

//     lower_table_keys.forEach(lower_table_key => {
//         obj[lower_table_key].forEach(lower_row => {
//             set_object_keys_by_select(lower_row, search[lower_table_key])
//         })
//     })

//     set_row_keys_by_select(obj, search.select)
// }

// // sets the keys in a row based on a select. Keys not in the select will only be kept if they 
// // are an array or object. This function mutates the input row
// const set_row_keys_by_select = (row, select) => {
//     const all_selected = includes('*', force_array(select)) || select === undefined
//     if (all_selected) {
//         return
//     }

//     keys(row).forEach(row_key => {
//         const row_value = row[row_key]

//         const select_columns = force_array(select).map(column => {
//             if (type(column) === 'Object') {
//                 const column_command = keys(column)[0]
//                 if (column_command === 'as') {
//                     return `${column[column_command][0]} AS ${column[column_command[1]]}`
//                 } else { // column is an aggregator
//                     const column_name = column[column_command]
//                     return `${column_command}_${column_name}`
//                 }
//             } else {
//                 return column
//             }
//         })

//         const should_delete =
//             type(row_value) !== 'Array'
//             && !includes(row_key, select_columns)

//         if (should_delete) {
//             delete row[row_key]
//         }
//     })
// }


// // takes results grouped by table route and returns a nested object of all the results
// //
// // route: should be like like 'table1.table2.table3', and should be only the root table to get everything nested.
// // results_by_route: should look like { [route]: rows }, for each route to be nested
// // filter_function: used to filter result rows and is used in recursion to filter out
// //      only those rows that are actually connected via foreign key
// //
// // returns an object like { [table]: rows }
// const nester = (table_infos, results_by_route, search, route, filter_function = row => true) => {
//     const routes = keys(results_by_route).map(split('.'))
//     const table_name = last(route)

//     const child_routes = routes.filter(child_route =>
//         startsWith(route, child_route)
//         && !equals(route, child_route)
//     )

//     const child_links = child_routes.map(child_route => {
//         const from_table = child_route[child_route.length - 2]
//         const to_table = last(child_route)
//         const connection = get_edge(from_table, to_table, table_infos)

//         return connection
//     })

//     const results = results_by_route[route.join('.')] || []
//     const rows_with_children = results.flatMap(row => {
//         if (!filter_function(row)) {
//             return []
//         }

//         const child_rows_by_table = {}
//         for (const child_link of child_links) {
//             const child_table = child_link.to_table
//             const child_route = [...route, child_table]
//             const child_filter = (child_row => child_row[child_link.to_key] === row[child_link.from_key])
//             const child_results = nester(table_infos, results_by_route, search, child_route, child_filter)

//             if (child_results[child_table].length > 0) {
//                 child_rows_by_table[child_table] = child_results[child_table]
//             }
//         }

//         return { ...row, ...child_rows_by_table }
//     })

//     return {
//         [table_name]: rows_with_children
//     }
// }

// export const get_root_table = query => keys(query).filter(key =>
//     type(query[key]) === 'Object' && key !== 'meta'
// )[0]


// // adds a bit to a given query that restricts the results to only allow descendants of the specified
// // ancestor. For this to work, the given ancestor must have rows in the results_by_table object
// const add_ancestor_where_clause = (table_infos, query, ancestor_rows, route_to_ancestor) => {
//     const ancestor_name = last(route_to_ancestor)
//     const table_under_ancestor = route_to_ancestor[route_to_ancestor.length - 2]
//     const last_connection_to_ancestor = get_edge(table_under_ancestor, ancestor_name, table_infos)
//     const ancestor_linking_key = last_connection_to_ancestor.to_key

//     if (ancestor_rows === undefined) {
//         throw Error(`Could not find rows for ancestor ${ancestor_name}`)
//     }

//     const ancestor_linking_key_values = ancestor_rows.map(prop(ancestor_linking_key))

//     const ancestor_query = convert_search_where(
//         table_infos,
//         {
//             any: [drop(1, route_to_ancestor).join('.'), {
//                 in: [ancestor_linking_key, ancestor_linking_key_values]
//             }]
//         },
//         route_to_ancestor[0]
//     )

//     const where = query.where || {}
//     const new_where = combine_wheres(where, ancestor_query, 'and')

//     return { ...query, where: new_where }
// }

// const simple_query_runner = async (connection, get_row_count, query) => {
//     const sql_string = json_to_sql(query, false)
//     const results = get_row_count
//         ? await connection.query(`${sql_string}; \n SELECT FOUND_ROWS() as row_count`)
//         : await connection.query(sql_string)
//     if (get_row_count) {
//         results[1] = results[1][0].row_count
//     }
//     return results
// }

// const run_sql_local_searches = async (table_infos, query, connection, results_by_route, route = [], last_searched_ancestor = undefined) => {
//     const table_name = query.from
//     route = append(table_name, route)
//     const is_root_table = route.length === 1

//     let child_tables
//     if (table_name) {
//         const child_connections = get_possible_edges(table_name, table_infos)
//         child_tables = child_connections
//             .map(prop('to_table'))
//             .filter(child_table => has(child_table, query))
//     } else {
//         child_tables = [get_root_table(query)]
//     }

//     const child_promises = (own_query, has_where) => child_tables.map(child_table => {
//         const child_query = own_query[child_table]
//         const new_last_searched_ancestor = has_where
//             ? table_name
//             : last_searched_ancestor
//         return run_sql_local_searches(table_infos, child_query, connection, results_by_route, route, new_last_searched_ancestor)
//     })

//     const has_where = has('where', query)

//     const searched_ancestor_index = findIndex(equals(last_searched_ancestor), route)
//     const route_to_ancestor = reverse(slice(searched_ancestor_index, Infinity, route))
//     const ancestor_route = slice(0, searched_ancestor_index + 1, route)
//     const ancestor_rows = results_by_route[ancestor_route.join('.')]

//     let row_count
//     const own_promise = async own_query => {
//         if (!is_root_table) { // if its a nested table, and its higher table doesnt have rows, dont run a query, just return 0 rows
//             if (ancestor_rows.length === 0) {
//                 results_by_route[route.join('.')] = []
//                 return
//             }
//         }

//         const runnable_query = omit(child_tables, own_query)
//         if (is_root_table) {
//             // root table, so we need the row count
//             runnable_query.select_sql_calc_found_rows = runnable_query.select
//             delete runnable_query.select
//             const [rows, queried_row_count] = await simple_query_runner(connection, true, runnable_query)
//             results_by_route[route.join('.')] = rows
//             row_count = queried_row_count
//         } else {
//             const rows = await simple_query_runner(connection, false, runnable_query)
//             results_by_route[route.join('.')] = rows
//         }
//     }

//     const query_with_ancestor_filter = last_searched_ancestor === undefined
//         ? query
//         : add_ancestor_where_clause(table_infos, query, ancestor_rows, route_to_ancestor)

//     if (has_where || is_root_table) {
//         // this table has a search, so we have to wait for it before processing children
//         await own_promise(query_with_ancestor_filter)

//         await Promise.all(child_promises(query_with_ancestor_filter, true)).catch(err => {
//             throw err
//         })
//     } else {
//         // this table has no searches, so we can run the child queries immediately.
//         await Promise.all([...child_promises(query_with_ancestor_filter, false), own_promise(query_with_ancestor_filter)]).catch(err => {
//             throw err
//         })
//     }

//     if (is_root_table) {
//         return row_count
//     }
// }


// /*


// 1. orma json -> sql strings (pure mapping function) (one layer at a time)
// 1b. Add keys for nesting purposes
// 2a. table graph analyzer, with insert order (what can be done at the same time, reverse nesting at the same time, output format for query plan)
// 2b. Way of specifying data to insert from one query into the next sql string
// 3. fast nester
// 4. strip nesting keys so user only gets what is asked for




// */


// export const query_util = async (table_infos, query, connection = undefined) => {

//     // const included_tables = get_included_tables(query)
//     const sql_query = query_to_sql_query(table_infos, query)

//     if (connection === undefined) {
//         connection = mysql
//     }

//     const root_table = get_root_table(query)

//     let results_by_route = {}
//     const root_row_count = await run_sql_local_searches(table_infos, sql_query[root_table], connection, results_by_route)


//     const nested_results = nester(table_infos, results_by_route, query, [root_table])
//     set_object_keys_by_select(nested_results, query)

//     return {
//         meta: {
//             [root_table]: {
//                 count: root_row_count
//             }
//         },
//         ...nested_results
//     }
// }