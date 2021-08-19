import { error_type } from '../helpers/error_handling'
import { deep_for_each, deep_get, deep_set, drop, last } from '../helpers/helpers'
import {
    get_all_edges,
    get_child_edges,
    get_parent_edges,
    get_primary_keys,
    get_unique_fields,
    is_parent_entity,
    is_reserved_keyword
} from '../helpers/schema_helpers'
import { path_to_string, string_to_path } from '../helpers/string_to_path'
import { toposort } from '../helpers/toposort'
import { orma_schema } from '../introspector/introspector'
import { json_to_sql } from '../query/query'

export type operation = 'create' | 'update' | 'delete'
export type mutate_fn = (
    statements
) => Promise<{ path: (string | number)[]; row: Record<string, unknown> }[]>
export type escape_fn = (string) => string
export type statements = {
    command_json: Record<any, any>
    command_sql: string
    entity_name: string
    operation: operation
    paths: (string | number)[][]
}[]
export const orma_mutate = async (
    mutation,
    mutate_fn: mutate_fn,
    escape_fn: escape_fn,
    orma_schema: orma_schema
) => {
    // [[{"operation":"create","paths":[...]]}],[{"operation":"create","paths":[...]}]]
    const mutate_plan = get_mutate_plan(mutation, orma_schema)

    let tier_results = {
        // Will be built up as each phase of the mutate_plan is executed
        // [path]: {...}
    }

    for (let i = 0; i < mutate_plan.length; i++) {
        const planned_statements = mutate_plan[i]

        const statements: statements = planned_statements.flatMap(({ operation, paths }) => {
            const command_json_paths = get_command_jsons(
                operation,
                paths,
                mutation,
                tier_results,
                orma_schema
            )
            return command_json_paths
        })

        const results = await mutate_fn(statements)

        results.forEach((result, i) => {
            const { path, row } = result
            tier_results[path_to_string(path)] = row
        })
    }

    const mutation_response = Object.entries(tier_results).reduce(
        (acc, [path_string, row]: [string, {}], i) => {
            const path = string_to_path(path_string)
            const mutation_obj = deep_get(path, mutation)
            const merged = { ...mutation_obj, ...row }
            deep_set(path, merged, acc)
            return acc
        },
        {}
    )
    return mutation_response
}

const escape_all = (command_jsons, escape_fn) => {
    // TODO escape create update and delete
    return command_jsons
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
 * (if they have inherited operation), but the same opeartion will be done on all of them.
 * For this to work, all required foreign keys must have already been inserted (for creates)
 */
export const get_command_jsons = (
    operation: string,
    paths: (string | number)[][],
    mutation,
    tier_results,
    orma_schema: orma_schema
): statements => {
    if (operation === 'update') {
        const command_json_paths = get_update_jsons(paths, mutation, orma_schema)
        return command_json_paths.map(el => ({ ...el, operation }))
    }

    if (operation === 'delete') {
        const command_json_paths = get_delete_jsons(paths, mutation, orma_schema)
        return command_json_paths.map(el => ({ ...el, operation }))
    }

    if (operation === 'create') {
        const command_json_paths = get_create_jsons(paths, mutation, tier_results, orma_schema)
        return command_json_paths.map(el => ({ ...el, operation }))
    }

    throw new Error(`Unknown operation ${operation}`)
}

const get_update_jsons = (paths: (string | number)[][], mutation, orma_schema: orma_schema) => {
    if (paths.length === 0) {
        return []
    }

    const entity_name = path_to_entity(paths[0])

    const jsons = paths.map(path => {
        const record = deep_get(path, mutation)
        const identifying_keys = get_identifying_keys(entity_name, record, orma_schema)

        throw_identifying_key_errors('update', identifying_keys, path, mutation)

        const where = generate_record_where_clause(identifying_keys, record)

        const keys_to_set = Object.keys(record)
            .filter(key => !identifying_keys.includes(key))
            .filter(key => typeof record[key] !== 'object')
            .filter(key => !is_reserved_keyword(key))

        return {
            $update: entity_name,
            $set: keys_to_set.map(key => [key, record[key]]),
            $where: where
        }
    })

    return jsons.map((el, i) => ({
        paths: [paths[i]],
        entity_name,
        command_json: el,
        command_sql: json_to_sql(el)
    }))
}

const get_delete_jsons = (paths: (string | number)[][], mutation, orma_schema: orma_schema) => {
    if (paths.length === 0) {
        return []
    }

    const entity_name = path_to_entity(paths[0])

    const jsons = paths.map(path => {
        const record = deep_get(path, mutation)
        const identifying_keys = get_identifying_keys(entity_name, record, orma_schema)

        throw_identifying_key_errors('delete', identifying_keys, path, mutation)

        const where = generate_record_where_clause(identifying_keys, record)

        return {
            $delete_from: entity_name,
            $where: where
        }
    })

    return jsons.map((el, i) => ({
        paths: [paths[i]],
        entity_name,
        command_json: el,
        command_sql: json_to_sql(el)
    }))
}

const get_create_jsons = (
    paths: (string | number)[][],
    mutation,
    tier_results,
    orma_schema: orma_schema
) => {
    if (paths.length === 0) {
        return []
    }

    const entity_name = path_to_entity(paths[0])

    const records = paths.map(path => {
        // If there are parents we want to add the parent_id to the record
        const record_without_fk = deep_get(path, mutation)

        // Find the names of parents (database parents)
        const parent_edges = get_parent_edges(entity_name, orma_schema)
        const parent_names = parent_edges.map(el => el.to_entity)

        // look one layer above and below in the mutation to get names of tables
        // figure out which tables are parents
        const spot = deep_get(path, mutation)
        const above_name = path?.[path.length - 4] as string
        const parent_names_from_below = Object.keys(spot).filter(key => parent_names.includes(key))
        const above_name_is_parent = parent_names.includes(above_name)

        // If there are no parents return the record as is
        if (!above_name_is_parent && parent_names_from_below.length == 0) {
            return record_without_fk
        }

        // If there are parents from above
        if (above_name_is_parent) {
            const path_to_parent = drop(2, path)
            const parent_row_results = tier_results[path_to_string(path_to_parent)]
            const { from_field, to_field } = parent_edges.filter(
                el => el.to_entity === above_name
            )[0]
            const parent_id = parent_row_results[to_field]
            const record_with_fk = { ...record_without_fk, [from_field]: parent_id }
            return record_with_fk
        }

        // If there are parents
        // take the data from tier results and put it inside the record

        debugger
    })

    // get insert keys by combining the keys from all records
    const insert_keys = paths.reduce((acc, path, i) => {
        const record = records[i]

        // filter lower tables and keywords such as $operation from the sql
        const keys_to_insert = Object.keys(record)
            .filter(key => typeof record[key] !== 'object')
            .filter(key => !is_reserved_keyword(key))

        keys_to_insert.forEach(key => acc.add(key))

        return acc
    }, new Set() as Set<string>)

    const values = paths.map((path, i) => {
        const record = records[i]
        const record_values = [...insert_keys].map(key => record[key] ?? null)
        return record_values
    })

    const command_json = {
        $insert_into: [entity_name, [...insert_keys]],
        $values: values
    }

    return [
        {
            paths,
            entity_name,
            command_json,
            command_sql: json_to_sql(command_json)
        }
    ]
}

const generate_record_where_clause = (
    identifying_keys: string[],
    record: Record<string, unknown>
) => {
    const where_clauses = identifying_keys.map(key => ({
        $eq: [key, record[key]]
    }))

    const where =
        where_clauses.length > 1
            ? {
                  and: where_clauses
              }
            : where_clauses?.[0]

    return where
}

/**
 * Mutates the input mutation by copying foreign key values from parents to the children at the specified paths
 */
const propagate_foreign_keys = (path_to_parent: (string | number)[], mutation, orma_schema) => {
    // when creating an entity, all foreign keys must be present. These can be taken from the user input
    const entity_name = path_to_parent[nth_last_entity_index(path_to_parent, 0)] as string
    const record = deep_get(path_to_parent, mutation)

    const edges_to_children = get_child_edges(entity_name, orma_schema)
    const parent_paths = get_mutation_child_paths(path_to_parent, mutation, edges_to_children)

    // return [paths, values]

    parent_paths.forEach((parent_path, i) => {
        const edge_to_parent = edges_to_children[i]
        const parent_record = deep_get(parent_path, mutation)

        record[edge_to_parent.from_field] = parent_record[edge_to_parent.to_field]
    })
}

/**
 * Maps a list of edges to lists to paths to children of a specified record. The child paths returned will be connected to the given parent,
 * either they will be a higher or lower records.
 */
const get_mutation_child_paths = (path: (string | number)[], mutation, edges_to_children) => {
    const higher_entity_index = nth_last_entity_index(path, 1)
    const higher_entity_name =
        higher_entity_index >= 0 ? (path[higher_entity_index] as string) : undefined
    const higher_path = higher_entity_index >= 0 ? path.slice(0, higher_entity_index) : undefined
    const record = deep_get(path, mutation)

    const lower_entity_names = Object.keys(record).filter(
        key => typeof record[key] === 'object' && record[key]
    ) // null is considered an 'object'
    const child_paths = edges_to_children.map(edge => {
        const child_entity = edge.to_entity
        if (higher_entity_name === child_entity) {
            return higher_path
        }

        for (const lower_entity_name of lower_entity_names) {
            if (lower_entity_name === child_entity) {
                const is_array = Array.isArray(record[lower_entity_name])
                const edge_child_paths = is_array
                    ? [...path, lower_entity_name, 0]
                    : [...path, lower_entity_name]

                return edge_child_paths
            }
        }
    })

    return child_paths
}

// const set_mutation_foreign_key = (parent_record, child_record, )

const get_parent_path = (path: (number | string)[]) => {
    return typeof last(path) === 'number'
        ? path.slice(0, path.length - 2)
        : path.slice(0, path.length - 1)
}

const path_to_entity = (path: (number | string)[]) => {
    return typeof last(path) === 'number'
        ? (path[path.length - 2] as string)
        : (last(path) as string)
}

const nth_last_entity_index = (path: (number | string)[], n: number) => {
    let entity_number = 0
    for (let i = path.length; i > 0; i--) {
        const el = path[i]
        if (typeof el === 'string') {
            if (entity_number === n) {
                return i
            } else {
                entity_number += 1
            }
        }
    }

    return -1
}

const get_identifying_keys = (
    entity_name: string,
    record: Record<string, any>,
    orma_schema: orma_schema
) => {
    const primary_keys = get_primary_keys(entity_name, orma_schema)
    const has_primary_keys = primary_keys.every(primary_key => record[primary_key])
    if (has_primary_keys && primary_keys.length > 0) {
        return primary_keys
    }

    const unique_keys = get_unique_fields(entity_name, orma_schema)
    const included_unique_keys = unique_keys.filter(unique_key => record[unique_key])
    if (included_unique_keys.length === 1) {
        // if there are 2 or more unique keys, we cant use them since it would be ambiguous which we choose
        return included_unique_keys
    }

    return undefined
}

const throw_identifying_key_errors = (
    operation: string,
    identifying_keys: string[],
    path: (string | number)[],
    mutation
) => {
    if (!identifying_keys || identifying_keys.length === 0) {
        throw {
            message: `Could not find primary keys or unique keys in record to ${operation}`,
            path: path,
            original_data: mutation,
            stack_trace: new Error().stack,
            additional_info: {
                identifying_columns: identifying_keys ?? 'none'
            }
        } as error_type
    }
}

export const get_mutate_plan = (mutation, orma_schema: orma_schema) => {
    /*
    This function is an algorithm that wont make sense without an explanation. The idea is to generate a mutate plan
    which splits rows (specified by paths to that row) into tiers. Each tier can be run in parallel (so order within a
    tier is not guaranteed), but tiers must be run sequentially (operations in one tier can rely on previous tiers being
    complete).

    We will generate one that runs as fast as possible using these constraints:
        - update operations can run in any order
        - for a row to be created, its immediate parent must be created first
        - for a row to be deleted, its immediate children must be deleted first

    Terminology:
        route - in this function, a route is an array of the form [operation, ...template_path] where operation is one of 'create',
            'update' or 'delete' and a template_path is like a path but all the array indices are replaced with 0
        

    Algorithm idea:
        we will encode all the information about our constraints into a route_graph. We then run a topological sort on it
        which gives the most efficient mutate plan

    Algorithm:

    We generate 2 intermediary objects:
    paths_by_route groups paths in the mutation object based on their route

    route_graph is a directed acyclic graph (of form { [parent]: new Set(...children)}).
        Each node is a JSON.stringified version of a possible route in the mutation

    walk_object:
        make sure the current path is in paths_by_route
        make sure the current and parent nodes are in the route_graph
        We will now form one or zero edges in the route_graph based on the child and parent operations. 
        The table summarizes possible combinations:

        child_operation   | parent_operation | result
        create            | create           | form a edge from parent -> child (parent goes first regardless of whether the parent is the child entity or the parent entity)
        create            | update           | no edge formed (no guarantees on order of operations)
        update            | update           | no edge formed (updates can be processed in any order since they dont rely on other data being/not being there)
        delete            | delete           | form a edge from child -> parent (deletes are processed child first)
        delete            | update           | no edge formed (no guarantees on order of operations)

        (some combinations like child = update, parent = create since they are not allowed in a mutation)
        
        So basically we only form a edge on the graph when the current and parent opeartions are the same and are not 'update'.
        If they are both create, the edge is parent -> child, if delete the edge is child -> parent

        The effect will be that different operations will form disconnected subgraphs. Running toposort on the final
        graph will create a plan which preserves relative order within one operation, but does not guarantee ordering
        among different operations. This should be faster then doing all on one operation, then all of the next, etc. 
        since everything can be done simultaneously, although we lose some features like deleting a row first which frees up
        a value for a unique column which is created in the same request (now we would have to reject the request since
        we cant guarantee the delete will be run first).

*/

    const paths_by_route: Record<string, (string | number)[][]> = {}

    // construct a directed acyclic graph reflecting the parent/child relationships of the routes
    // we use sets because we need to quickly add items to the graph while avoiding duplicates
    // (one will be added per row in the mutation, so its important that this is O(1))
    const route_graph: Record<string, Set<string>> = {}

    deep_for_each(mutation, (value, path) => {
        if (typeof value !== 'object' || Array.isArray(value) || path.length === 0) {
            return // not pointing to a single row
        }

        // use the closest ancestor with an $operation as the current $operation. This handles operation inheritance
        const operation = path
            .map((el, i) => path.slice(0, path.length - i))
            .concat([[]]) // this is because we can also inherit operation from the root
            .map(path_slice => deep_get([...path_slice, '$operation'], mutation)) // check the operation at each path slice
            .find((el): el is string => typeof el === 'string') // find the first defined operation

        if (!operation) {
            throw new Error(`Could not find an inherited operation for ${JSON.stringify(path)}`)
        }

        const path_template = path.map(el => (typeof el === 'number' ? 0 : el))
        const route = [operation, ...path_template]
        const route_string = path_to_string(route)

        // add path to paths_by_route
        if (!paths_by_route[route_string]) {
            paths_by_route[route_string] = []
        }
        paths_by_route[route_string].push(path)

        // make sure this ends up in the graph (and so in the mutate plan), even if it has no lower/higher tables
        if (!route_graph[route_string]) {
            route_graph[route_string] = new Set()
        }

        const higher_path =
            typeof last(path) === 'number'
                ? path.slice(0, path.length - 2) // need to remove the entity name and index template (the number 0)
                : path.slice(0, path.length - 1) // only remove the entity name

        if (higher_path.length === 0) {
            return //no parent to look at
        }

        // if higher row does not have $operation, it inherits the same operation as the current row
        const higher_operation = deep_get([...higher_path, '$operation'], mutation) ?? operation
        const higher_path_template =
            typeof last(path_template) === 'number'
                ? path_template.slice(0, path_template.length - 2) // need to remove the entity name and index template (the number 0)
                : path_template.slice(0, path_template.length - 1) // only remove the entity name

        const higher_route = [higher_operation, ...higher_path_template]
        const higher_route_string = path_to_string(higher_route)

        if (!route_graph[higher_route_string]) {
            route_graph[higher_route_string] = new Set()
        }

        const entity =
            typeof last(path) === 'number'
                ? (path[path.length - 2] as string)
                : (last(path) as string)

        const higher_entity =
            typeof last(higher_path) === 'number'
                ? (higher_path[higher_path.length - 2] as string)
                : (last(higher_path) as string)

        const higher_entity_is_parent = is_parent_entity(higher_entity, entity, orma_schema) // in cases of self-referenced entities, this will return true. So they will be processed in regular order (top -> bottom for creates, bottom -> top for deletes)

        const parent_route_string = higher_entity_is_parent ? higher_route_string : route_string // regular nesting
        const child_route_string = higher_entity_is_parent ? route_string : higher_route_string // reverse nesting

        if (operation === higher_operation) {
            if (operation === 'create') {
                route_graph[parent_route_string].add(child_route_string)
            }

            if (operation === 'delete') {
                // reverse the parent/child relationship for deletes, since deletes must be done child-first while other operations are parent-first
                route_graph[child_route_string].add(parent_route_string)
            }

            // update doesnt get edges in route_graph since updates can be processed in any order
        }
    })

    // convert sets into arrays for toposort
    const toposort_graph = Object.keys(route_graph).reduce((acc, key) => {
        return {
            ...acc,
            [key]: [...route_graph[key]]
        }
    }, {})
    const topological_ordering = toposort(toposort_graph)

    const mutate_plan = topological_ordering.map(route_strings =>
        route_strings.map(route_string => ({
            operation: string_to_path(route_string)[0] as operation,
            paths: paths_by_route[route_string]
        }))
    )

    return mutate_plan
}

/*
Comments:

How can the user mutate on renamed children (if they queried renamed fields, we can the query object to be the same as the mutate object. Myabe add $from to every query result and have mutate respect that? would add data though... Myabe user has to include the from manually, like from: 'name_of_real_table' or from: { $from_table: true })


{
    products
}

*/
