import { clone, deep_for_each, deep_get, deep_map, deep_set, drop, last } from '../helpers/helpers'
import { nester } from '../helpers/nester'
import { get_direct_edge, get_direct_edges, get_edge_path, is_reserved_keyword } from '../helpers/schema_helpers'
import { orma_schema } from '../introspector/introspector'

type expression = {
    [commands: string]: expression | expression[]
} | primitive

type primitive = string | number | Date | Array<any>


// this is a simple parser function, whatever comes in the json object is placed as-is in the output sql string.
// more complicated rules (such as adding a 'from' clause, or adding group-by columns on select *) is handled while the query is still a json object
export const json_to_sql = (expression: expression, path = []) => {
    // strings and other non-objects are returned as-is
    const is_object = typeof expression === 'object' && !Array.isArray(expression)
    if (!is_object) {
        return expression
    }

    const sorted_commands = Object.keys(expression).sort((command1, command2) => {
        // unspecified commands go at the beginning
        const i1 = command_order[command1] || -1
        const i2 = command_order[command2] || -1
        return i1 - i2
    })

    const parsed_commands = sorted_commands.map(command => {
        if (expression[command] === undefined) {
            return ''
        }

        const command_parser = sql_command_parsers[command]
        if (!command_parser) {
            throw new Error(`Cannot find command parser for ${ command }.`)
        }

        const args = expression[command]
        const parsed_args = Array.isArray(args)
            ? args.map((arg, i) => json_to_sql(arg, [...path, command, i]))
            : json_to_sql(args, [...path, command])

        return command_parser(parsed_args, path)
    }).filter(el => el !== '')

    return parsed_commands.join(' ')
}

const command_order = {
    $delete_from: -3,
    $update: -2,
    $set: -1,
    $select: 0,
    $from: 1,
    $where: 2,
    $group_by: 3,
    $having: 4,
    $order_by: 5,
    $limit: 6,
    $offset: 7,
    $insert_into: 8,
    $values: 9,
}

/*

{
    $eq: ['variant_id', {
        $any: {
            $select...
        }
    }]
}

*/

const sql_command_parsers = {
    $select: args => `SELECT ${ args.join(', ') }`,
    $as: args => `(${ args[0] }) AS ${ args[1] }`,
    $from: args => `FROM ${ args }`,
    $where: args => `WHERE ${ args }`,
    $having: args => `HAVING ${ args }`,
    $in: (args, path) => `${ args[0] }${ last(path) === '$not' ? ' NOT' : '' } IN (${ args[1] })`,
    $group_by: args => `GROUP BY ${ args.join(', ') }`,
    $order_by: args => `ORDER BY ${ args.join(', ') }`,
    $asc: args => `${ args } ASC`,
    $desc: args => `${ args } DESC`,
    $and: (args, path) => {
        const res = `(${ args.join(') AND (') })`
        return last(path) === '$not' ? `NOT (${ res })` : res
    },
    $or: (args, path) => {
        const res = `(${ args.join(') OR (') })`
        return last(path) === '$not' ? `NOT (${ res })` : res
    },
    $any: args => `ANY (${ args })`,
    $all: args => `ALL (${ args })`,
    $eq: (args, path) => args[1] === null
        ? `${ args[0] }${ last(path) === '$not' ? ' NOT' : '' } IS NULL`
        : `${ args[0] } ${ last(path) === '$not' ? '!' : '' }= ${ args[1] }`,
    $gt: (args, path) => `${ args[0] } ${ last(path) === '$not' ? '<=' : '>' } ${ args[1] }`,
    $lt: (args, path) => `${ args[0] } ${ last(path) === '$not' ? '>=' : '<' } ${ args[1] }`,
    $gte: (args, path) => `${ args[0] } ${ last(path) === '$not' ? '<' : '>=' } ${ args[1] }`,
    $lte: (args, path) => `${ args[0] } ${ last(path) === '$not' ? '>' : '<=' } ${ args[1] }`,
    $exists: (args, path) => `${ last(path) === '$not' ? 'NOT ' : '' }EXISTS (${ args })`,
    $limit: args => `LIMIT ${ args }`,
    $offset: args => `OFFSET ${ args }`,
    $like: (args, path) => {
        const string_arg = args[1].toString()
        const search_value = string_arg
            .replace(/^\'/, '')
            .replace(/\'$/, '') // get rid of quotes if they were put there by escape()
        return `${ args[0] }${ last(path) === '$not' ? ' NOT' : '' } LIKE '%${ search_value }%'`
    },
    $not: args => args, // not logic is different depending on the children, so the children handle it
    $sum: args => `SUM(${ args })`,
    // not: {
    //     in: args => `${args[0]} NOT IN (${args[1]})`,
    //     and: args => `NOT ((${args.join(') AND (')}))`,
    //     or: args => `NOT ((${args.join(') OR (')}))`,
    //     eq: args => args[1] === null ? `${args[0]} IS NOT NULL` : `${args[0]} != ${args[1]}`,
    //     gt: args => `${args[0]} <= ${args[1]}`,
    //     lt: args => `${args[0]} >= ${args[1]}`,
    //     gte: args => `${args[0]} < ${args[1]}`,
    //     lte: args => `${args[0]} > ${args[1]}`,
    //     exists: args => `NOT EXISTS (${args})`,
    // }
    $insert_into: ([table_name, [...columns]]) => `INSERT INTO ${ table_name } (${ columns.join(', ') })`,
    $values: (values: any[][]) => `${ values.map(inner_values => `(${ inner_values.join(', ') })`).join(', ') }`,
    $update: (table_name) => `${ table_name }`,
    $set: (...items) => `${ items
        .map((column, value) => `${ column } = ${ value }`)
        .join(', ') }`,
    $delete_from: (table_name) => `DELETE FROM ${ table_name }`
}

/*

[
    [{
        sql: 'SELECT'
    }]
]


*/

export const get_query_plan = (query): string[][][] => {
    const query_plan: string[][][] = []
    deep_for_each(query, (value, path: string[]) => {
        if (typeof value === 'object') {
            const query = value
            const has_filter = value.$where || value.$having

            const child_paths = Object.keys(value).map(child_key => {
                if (is_subquery(value[child_key])) {
                    return [...path, child_key]
                }
            }).filter(el => el !== undefined)

            if (child_paths.length === 0) {
                return // subquery with nothing else nested on
            }

            const is_root = path.length === 0 // this is to start off the query plan (cant append if there is nothing there)
            // entities directly under the root need to ge after because all entitiesneed at least one ancestor which is already queried
            // so we can search for those ancestor ids. This ensures that at least the root will have already been searched. 
            const is_root_child = path.length === 1 

            // if this has a $where, or its the root/root child, then all the child paths go to a new tier. Otherwise, the child paths are appended on to the last tier
            if (has_filter || is_root || is_root_child) {
                query_plan.push(child_paths)
            } else {
                last(query_plan).push(...child_paths)
            }
        }
    })

    return query_plan
}

export const is_subquery = (subquery: any) => {
    if (typeof subquery !== 'object' || Array.isArray(subquery)) {
        return false
    }

    const subquery_keys = Object.keys(subquery)
    return subquery_keys.some(key => !is_reserved_keyword(key)) || subquery_keys.length === 0
}

// This function will default to the from clause
export const get_real_parent_name = (path: (string | number)[], query) => {
    if (path.length < 2) return null

    return deep_get([...drop(1, path), '$from'], query, null) || path[path.length - 2]
}

// This function will default to the from clause
export const get_real_entity_name = (path: (string | number)[], query) => {
    return deep_get([...path, '$from'], query, null) || last(path)
}

export const get_subquery_sql = (query, subquery_path: string[], previous_results: (string[] | Record<string, unknown>[])[][], orma_schema: orma_schema): string => {
    const json_sql = query_to_json_sql(query, subquery_path, previous_results, orma_schema)
    const sql = json_to_sql(json_sql)

    return sql
}

/**
 * transforms a query into a simplified json sql. This is still json, but can be parsed directly into sql (so no subqueries, $from is always there etc.)
 */
export const query_to_json_sql = (query, subquery_path: string[], previous_results: (string[] | Record<string, unknown>[])[][], orma_schema: orma_schema): Record<string, any> => {
    const subquery = deep_get(subquery_path, query)

    const reserved_commands = Object.keys(subquery).filter(is_reserved_keyword)
    const reserved_json = reserved_commands.reduce((previous, key) => {
        return {
            ...previous,
            [key]: subquery[key]
        }
    }, {})

    const $select = select_to_json_sql(query, subquery_path, orma_schema)
    const $from = subquery.$from ?? last(subquery_path)
    const $where = where_to_json_sql(query, subquery_path, previous_results, orma_schema)
    const $having = having_to_json_sql(query, subquery_path, orma_schema)

    const json_sql: Record<string, unknown> = {
        ...reserved_json,
    }

    if ($select) {
        json_sql.$select = $select
    }

    if ($from) {
        json_sql.$from = $from
    }

    if ($where) {
        json_sql.$where = $where
    }

    if ($having) {
        json_sql.$having = $having
    }

    return json_sql
}

export const select_to_json_sql = (query, subquery_path: string[], orma_schema: orma_schema) => {
    const subquery = deep_get(subquery_path, query)
    const entity_name = last(subquery_path)

    const $select = Object.keys(subquery)
        .flatMap(key => {
            if (is_reserved_keyword(key)) {
                return []
            }

            if (subquery[key] === true) {
                return key
            }

            if (typeof subquery[key] === 'string') {
                return { $as: [subquery[key], key] }
            }

            if (typeof subquery[key] === 'object' && !is_subquery(subquery[key])) {
                return { $as: [subquery[key], key] }
            }

            if (typeof subquery[key] === 'object' && is_subquery(subquery[key])) {
                const lower_subquery = subquery[key]
                const lower_subquery_entity = lower_subquery.$from ?? key
                const edge_to_lower_table = get_direct_edge(entity_name, lower_subquery_entity, orma_schema)

                return edge_to_lower_table.from_field
            }

            return [] // subqueries are not handled here
        })

    if (subquery_path.length > 1) {
        const higher_entity = subquery_path[subquery_path.length - 2]
        const edge_to_higher_entity = get_direct_edge(entity_name, higher_entity, orma_schema)
        $select.push(edge_to_higher_entity.from_field)
    }

    return [...new Set($select)] // unique values
}

export const where_to_json_sql = (query, subquery_path: string[], previous_results: (string[] | Record<string, unknown>[])[][], orma_schema: orma_schema) => {
    const subquery = deep_get(subquery_path, query)

    let $where = subquery.$where

    const is_root_subquery = subquery_path.length <= 1
    if (!is_root_subquery) {
        const nesting_ancestor_index = get_nesting_ancestor_index(query, subquery_path)
        const ancestor_path = subquery_path.slice(0, nesting_ancestor_index + 1)

        const ancestor_rows = previous_results
            .filter(previous_result =>
                previous_result[0].toString() === ancestor_path.toString()
            ).map(previous_result => previous_result[1])
        [0] as Record<string, unknown>[]

        const path_to_ancestor = subquery_path.slice(nesting_ancestor_index, Infinity).reverse()
        const ancestor_where_clause = get_ancestor_where_clause(ancestor_rows, path_to_ancestor, orma_schema)
        $where = combine_where_clauses($where, ancestor_where_clause, '$and')
    }

    return $where
}

export const having_to_json_sql = (query: any, subquery_path: string[], orma_schema: orma_schema) => {
    const subquery = deep_get(subquery_path, query)
    const $having = subquery.$having

    return $having
}

/* gives a query that contains both queries combined with the either '$and' or '$or'. 
 * Prevents combine_with duplication if one of the qureies, for instance, already has an '$and' clause
 */
export const combine_where_clauses = (where1: Record<string, unknown>, where2: Record<string, unknown>, connective: '$and' | '$or') => {
    if (!where1) {
        return where2
    }

    if (!where2) {
        return where1
    }

    if (where1[connective] && where2[connective]) {
        const where1_items = where1[connective] as Array<any>
        const where2_items = where2[connective] as Array<any>
        return {
            [connective]: [...where1_items, ...where2_items]
        }
    }

    if (where1[connective]) {
        const where1_items = where1[connective] as Array<any>
        return {
            [connective]: [...where1_items, where2]
        }
    }

    if (where2[connective]) {
        const where2_items = where2[connective] as Array<any>
        return {
            [connective]: [where1, ...where2_items]
        }
    }

    return {
        [connective]: [where1, where2]
    }
}

/**
 * The first argument to the $any_path macro is a list of connected entities, with the
 * first one being connected to the currently scoped entity. The second argument is a where clause. This will be scoped to the last table in the first argument.
 * This will then filter all the current entities, where there is at least one connected current_entity -> entity1 -> entity2 that matches the provided where clause
 * 
 * @example
 * {
 *   $where: {
 *     $any_path: [['entity1', 'entity2'], { 
 *       ...where_clause_on_entity2 
 *     }]
 *   }
 * }
 * 
 * @param where a where clause
 * @param current_entity the root entity, since the path in the $any_path clause only starts from subsequent tables
 * @param is_having if true, will use $having. Otherwise will use $where
 * @returns a modified where clause
 */
export const convert_any_path_macro = (where: any, root_entity: string, is_having: boolean, orma_schema: orma_schema) => {
    if (!where) {
        return where
    }

    const processor = (value, path) => {
        if (typeof value === 'object' && value.$any) {
            const [any_path, subquery] = value.$any

            const previous_entities = path.flatMap((path_el, i) => {
                if (path_el === '$any') {
                    const path_segment = path.slice(0, i + 1)
                    const previous_any = deep_get(path_segment, where)
                    return last(previous_any[0])
                } else {
                    return []
                }
            }) as string[]

            const current_entity = last(previous_entities) ?? root_entity

            const full_path = [current_entity].concat(any_path)
            const edge_path = get_edge_path(full_path, orma_schema).reverse()
            const query = edge_path.reduce((acc, edge) => {
                return {
                    $in: [edge.from_field, {
                        $select: [edge.to_field],
                        $from: edge.to_entity,
                        [is_having ? '$having' : '$where']: acc
                    }]
                }
            }, subquery)

            return query
        } else {
            return value
        }
    }

    return deep_map(where, processor)
}

/**
 * Gets the closest ancestor that satisfies either of two conditions:
 *   1. has a where or having clause
 *   2. is the root ancestor
 * 
 * These are the ancestors that will be split into sequential queries, so we do a server-side nesting for them, 
 * rather than duplicating these queries in the database
 * 
 * @returns The index in the subquery_path of the nesting ancestor
 */
const get_nesting_ancestor_index = (query, subquery_path: string[]): number => {
    for (let i = subquery_path.length - 1; i >= 0; i--) {
        const subpath = subquery_path.slice(0, i + 1)
        const subquery = deep_get(subpath, query)
        if (subquery.$where || subquery.$having) {
            return i
        }
    }

    return 0
}

/**
 * Generates a where clause that restricts rows to only be ones connected to a given ancestor through a given route
 * @param ancestor_rows The foreign key values in these will be inserted into the where clause
 * @param path_to_ancestor This should start with the current table and end with the ancestor table
 * @returns A where clause
 */
const get_ancestor_where_clause = (ancestor_rows: Record<string, unknown>[], path_to_ancestor: string[], orma_schema: orma_schema) => {
    const ancestor_name = last(path_to_ancestor)
    const table_under_ancestor = path_to_ancestor[path_to_ancestor.length - 2]
    const last_edge_to_ancestor = get_direct_edge(table_under_ancestor, ancestor_name, orma_schema)

    if (ancestor_rows === undefined || ancestor_rows.length === 0) {
        throw Error(`No ancestor rows provided for ${ ancestor_name }`)
    }

    const ancestor_linking_key_values = ancestor_rows.map(row => row[last_edge_to_ancestor.to_field])

    const any_path = path_to_ancestor.slice(1, path_to_ancestor.length - 1)
    const ancestor_query = convert_any_path_macro(
        {
            $any: [any_path, {
                $in: [last_edge_to_ancestor.from_field, ancestor_linking_key_values]
            }]
        },
        path_to_ancestor[0],
        false,
        orma_schema
    )

    return ancestor_query
}

export const orma_nester = (results: [string[], Record<string, unknown>[]][], orma_schema: orma_schema) => {
    // get data in the right format for the nester
    const edges = results.map(result => {
        const path = result[0]
        if (path.length === 1) {
            return null
        }
        const entity = last(path)
        const higher_entity = path[path.length - 2]
        const edge = get_direct_edge(higher_entity, entity, orma_schema)
        return [edge.from_field, edge.to_field]
    })

    const data = results.map(result => {
        const path = result[0]
        const rows = result[1]
        return [path.flatMap(path_el => [path_el, 0]), rows] // all array nesting for now
    })

    return nester(data, edges)
}



// export const orma_query = async <schema>(raw_query: validate_query<schema>, orma_schema: validate_orma_schema<schema>, query_function: (sql_string: string) => Promise<Record<string, unknown>[]>) => {
export const orma_query = async (raw_query, orma_schema, query_function: (sql_string: string[]) => Promise<Record<string, unknown>[][]>) => {
    const query = clone(raw_query) // clone query so we can apply macros without mutating user input
    const query_plan = get_query_plan(query)
    let results = []

    // Sequential for query plan
    for (let i = 0; i < query_plan.length; i++) {
        const paths = query_plan[i]

        const sql_strings = paths.map(path => {
            // apply macros
            const where = deep_get([...path, '$where'], query)
            const macrod_where = convert_any_path_macro(where, last(path), false, orma_schema)
            deep_set([...path, '$where'], macrod_where, query)

            const having = deep_get([...path, '$having'], query)
            const macrod_having = convert_any_path_macro(having, last(path), false, orma_schema)
            deep_set([...path, '$having'], macrod_having, query)

            return get_subquery_sql(query, path, results, orma_schema)
        })

        // Promise.all for each element in query plan
        const output = await query_function(sql_strings)

        // Combine outputs
        sql_strings.forEach((_, i) => results.push([paths[i], output[i]]))

    }

    const output = orma_nester(results, orma_schema)

    return output
}
// ///-------------type-fest---------------
// type Without<FirstType, SecondType> = { [KeyType in Exclude<keyof FirstType, keyof SecondType>]?: never };
// type RequireExactlyOne<ObjectType, KeysType extends keyof ObjectType = keyof ObjectType> =
//     { [Key in KeysType]: (
//         Required<Pick<ObjectType, Key>> &
//         Partial<Record<Exclude<KeysType, Key>, never>>
//     ) }[KeysType] & _Omit<ObjectType, KeysType>;
// type _Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
// type MergeExclusive<FirstType, SecondType> =
//     (FirstType | SecondType) extends object ?
//     (Without<FirstType, SecondType> & SecondType) | (Without<SecondType, FirstType> & FirstType) :
//     FirstType | SecondType;
// type RequireAtLeastOne<
//     ObjectType,
//     KeysType extends keyof ObjectType = keyof ObjectType
//     > = {
//         // For each `Key` in `KeysType` make a mapped type:
//         [Key in KeysType]-?: Required<Pick<ObjectType, Key>> & // 1. Make `Key`'s type required
//         // 2. Make all other keys in `KeysType` optional
//         Partial<Pick<ObjectType, Exclude<KeysType, Key>>>;
//     }[KeysType] &
//     // 3. Add the remaining keys not in `KeysType`
//     Except<ObjectType, KeysType>;
// type Except<ObjectType, KeysType extends keyof ObjectType> = Pick<ObjectType, Exclude<keyof ObjectType, KeysType>>;
// ///----------------------------

// type validate_orma_schema<schema> = {
//     [entity in keyof schema]:
//     entity_schema<entity, schema>

// }
// type entity_schema<entity extends keyof schema, schema> =
//     // keyof schema[entity] extends keyof schema ? 
//     { $comment?: string }
//     & { [field: string]: field_schema<entity, schema> }
// // : never

// type field_schema<parent extends keyof schema, schema> = {
//     references?: 
//     { [entity in keyof schema]?: 
//         {}
//         // boolean
//         //  {[k in keyof schema[entity]]: boolean}
//         // RequireExactlyOne<{[field in keyof schema[entity]]: {}}>
//     } //{ products: { id: {} } } | { variants: { id: {} } }
// }

// const test = orma_query({}, {
//     products: { id: {} },
//     variants: {
//         id: {},
//         product_id: {
//             // references: { products: { id: {} } }
//             references: { products: {id: {}} }
//         }
//     },
//     images: {
//         id: {},
//         variant_id: {
//             references: { variants: { id8: {} }, hi: {} }
//         }
//     },
//     images2: {
//         id: {},
//         variant_id: {
//             // @ts-expect-error
//             references: { oops: { id: {} } }
//         }
//     },
//     images3: {
//         id: {},
//         variant_id: {
//             // @ts-expect-error
//             references: { variants: { id: {} }, hi: {}, }
//         }
//     }
// }, (s) => ([{ a: 'hi' }]))


// type validate_query<schema> = {
//     [entity in keyof schema]: boolean
// }
// const test2 = orma_query({
//     variants: true,
//     products: true,
//     poop: true,
// }, {
//     variants: {id: {}},
//     products: {id: {}},
// }, (s) => Promise.resolve([{}]))

/*


- get all data
- nest data





*/