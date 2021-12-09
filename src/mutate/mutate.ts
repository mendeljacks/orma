import { deep_merge } from '../helpers/deep_merge'
import { error_type } from '../helpers/error_handling'
import {
    deep_for_each,
    deep_get,
    deep_set,
    drop,
    is_simple_object,
    last,
} from '../helpers/helpers'
import {
    get_all_edges,
    get_child_edges,
    get_direct_edge,
    get_parent_edges,
    get_primary_keys,
    get_unique_field_groups,
    is_parent_entity,
    is_reserved_keyword,
} from '../helpers/schema_helpers'
import { path_to_string, string_to_path } from '../helpers/string_to_path'
import { toposort } from '../helpers/toposort'
import { orma_schema } from '../introspector/introspector'
import { json_to_sql } from '../query/json_sql'
import { combine_wheres } from '../query/query_helpers'

export type operation = 'create' | 'update' | 'delete'
export type mutate_fn = (
    statements
) => Promise<{ path: (string | number)[]; row: Record<string, unknown> }[]>
export type escape_fn = (string) => string
export type statements = {
    command_json: Record<any, any>
    command_json_escaped: Record<any, any>
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

        const statements: statements = planned_statements.flatMap(
            ({ operation, paths }) => {
                const command_json_paths = get_mutation_ast(
                    operation,
                    paths,
                    mutation,
                    tier_results,
                    orma_schema,
                    escape_fn
                )
                return command_json_paths
            }
        )

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
            const merged = deep_merge(mutation_obj, row)
            deep_set(path, merged, acc)
            return acc
        },
        {}
    )
    return mutation_response as any
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
export const get_mutation_ast = (
    operation: string,
    paths: (string | number)[][],
    mutation,
    tier_results,
    orma_schema: orma_schema,
    escape_fn
): statements => {
    if (operation === 'update') {
        const command_json_paths = get_update_asts(
            paths,
            mutation,
            orma_schema,
            escape_fn
        )
        return command_json_paths.map(el => ({ ...el, operation }))
    }

    if (operation === 'delete') {
        const command_json_paths = get_delete_asts(
            paths,
            mutation,
            orma_schema,
            escape_fn
        )
        return command_json_paths.map(el => ({ ...el, operation }))
    }

    if (operation === 'create') {
        const command_json_paths = get_create_jsons(
            paths,
            mutation,
            tier_results,
            orma_schema,
            escape_fn
        )
        return command_json_paths.map(el => ({ ...el, operation }))
    }

    throw new Error(`Unknown operation ${operation}`)
}

const get_update_asts = (
    paths: (string | number)[][],
    mutation,
    orma_schema: orma_schema,
    escape_fn
) => {
    if (paths.length === 0) {
        return []
    }

    const entity_name = path_to_entity(paths[0])

    const update_asts = paths.map(path => {
        const record = deep_get(path, mutation)
        const identifying_keys = get_identifying_keys(
            entity_name,
            record,
            orma_schema
        )

        throw_identifying_key_errors('update', identifying_keys, path, mutation)

        const where = generate_record_where_clause(
            identifying_keys,
            record,
            escape_fn
        )

        const keys_to_set = Object.keys(record)
            .filter(key => !identifying_keys.includes(key))
            .filter(
                key =>
                    !is_simple_object(record[key]) &&
                    !Array.isArray(record[key])
            )
            .filter(key => !is_reserved_keyword(key))

        return {
            $update: entity_name,
            $set: keys_to_set.map(key => [key, record[key]]),
            $where: where,
        }
    })

    return update_asts.map((update_ast, i) => {
        const update_ast_escaped = {
            ...update_ast,
            $set: update_ast.$set.map(key => [key[0], escape_fn(key[1])]),
        }
        return {
            paths: [paths[i]],
            entity_name,
            command_json: update_ast,
            command_json_escaped: update_ast_escaped,
            command_sql: json_to_sql(update_ast_escaped),
        }
    })
}

const get_delete_asts = (
    paths: (string | number)[][],
    mutation,
    orma_schema: orma_schema,
    escape_fn
) => {
    if (paths.length === 0) {
        return []
    }

    const entity_name = path_to_entity(paths[0])

    const jsons = paths.map(path => {
        const record = deep_get(path, mutation)
        const identifying_keys = get_identifying_keys(
            entity_name,
            record,
            orma_schema
        )

        throw_identifying_key_errors('delete', identifying_keys, path, mutation)

        const where = generate_record_where_clause(
            identifying_keys,
            record,
            escape_fn
        )

        return {
            $delete_from: entity_name,
            $where: where,
        }
    })

    const wheres = paths.map(path => {
        const record = deep_get(path, mutation)
        const identifying_keys = get_identifying_keys(
            entity_name,
            record,
            orma_schema
        )

        throw_identifying_key_errors('delete', identifying_keys, path, mutation)

        const where = generate_record_where_clause(
            identifying_keys,
            record,
            escape_fn
        )

        return where
    })

    const $where = combine_wheres(wheres, '$or')

    const ast = {
        $delete_from: entity_name,
        $where,
    }

    return [
        {
            paths,
            entity_name,
            command_json: ast,
            command_json_escaped: ast,
            command_sql: json_to_sql(ast),
        },
    ]
}

const get_create_jsons = (
    paths: (string | number)[][],
    mutation,
    tier_results,
    orma_schema: orma_schema,
    escape_fn
) => {
    if (paths.length === 0) {
        return []
    }

    const entity_name = path_to_entity(paths[0])

    const records = paths.map(path =>
        get_record_with_foreign_keys(mutation, path, tier_results, orma_schema)
    )

    // get insert keys by combining the keys from all records
    const insert_keys = paths.reduce((acc, path, i) => {
        const record = records[i]

        // filter lower tables and keywords such as $operation from the sql
        const keys_to_insert = Object.keys(record)
            .filter(
                key =>
                    !is_simple_object(record[key]) &&
                    !Array.isArray(record[key])
            )
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
        $values: values,
    }

    const command_json_escaped = {
        ...command_json,
        $values: values.map(el => el.map(escape_fn)),
    }

    return [
        {
            paths,
            entity_name,
            command_json,
            command_json_escaped,
            command_sql: json_to_sql(command_json_escaped),
        },
    ]
}

/**
 * Get the record at the specified location in the mutation with all the foreign keys of its parents.
 * Foreign keys are taken from the results_by_path object
 */
const get_record_with_foreign_keys = (
    mutation,
    record_path: (string | number)[],
    results_by_path,
    orma_schema: orma_schema
): Record<string, unknown> => {
    const entity_name = path_to_entity(record_path)
    const record = deep_get(record_path, mutation)

    // get a list of the above path, as well as any below paths.
    // Some of these might by parents and some might be children.
    const above_path = drop(2, record_path)
    const below_paths = Object.keys(record)
        .filter(key => Array.isArray(record[key]))
        .map(key => [...record_path, key, 0])
    const all_paths = [above_path, ...below_paths]

    // now we will get foreign keys for all the paths that are parent paths (ignoring child paths) and
    // put the foreign keys in an object of { [foreign_key_name]: foreign_key_value}
    // this object is in the right format to spread into the current record
    const foreign_keys = all_paths.reduce((obj, parent_path) => {
        const parent_entity_name = parent_path?.[parent_path.length - 2]
        // dont do anything for the child paths (foreign keys only come from parents by definition)
        if (!is_parent_entity(parent_entity_name, entity_name, orma_schema)) {
            return obj
        }

        // assuming the thing is a parent, we need exactly one edge from the current entity to the parent
        // (since the syntax has no way to specify which foreign key to use in that case).
        // This function throws an error if there is not exactly one edge
        const edge = get_direct_edge(
            entity_name,
            parent_entity_name,
            orma_schema
        )

        // we take the combined parent record as it is in the original mutation (this might have some of the foreign keys)
        // and also the same parent record from the previous results (e.g. autogenerated primiary keys from the database).
        // The combination of these will contain all the possible foreign key values from this specific parent.
        const parent_record = deep_get(parent_path, mutation)
        const previous_result = results_by_path[path_to_string(parent_path)]
        const parent_record_with_results = {
            ...parent_record,
            ...previous_result,
        }

        // now we just set the foreign key to whatever is in the combined parent object
        obj[edge.from_field] = parent_record_with_results[edge.to_field]
        return obj
    }, {})

    // combining the record (from the original mutation) with the foreign keys (for that record) gives the full record
    const record_with_foreign_keys = {
        ...record,
        ...foreign_keys,
    }

    return record_with_foreign_keys
}

const generate_record_where_clause = (
    identifying_keys: string[],
    record: Record<string, unknown>,
    escape_fn
) => {
    const where_clauses = identifying_keys.map(key => ({
        $eq: [key, escape_fn(record[key])],
    }))

    const where =
        where_clauses.length > 1
            ? {
                  $and: where_clauses,
              }
            : where_clauses?.[0]

    return where
}

const path_to_entity = (path: (number | string)[]) => {
    return typeof last(path) === 'number'
        ? (path[path.length - 2] as string)
        : (last(path) as string)
}

export const get_identifying_keys = (
    entity_name: string,
    record: Record<string, any>,
    orma_schema: orma_schema
) => {
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
        return included_unique_keys[0]
    }

    return []
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
                identifying_columns: identifying_keys ?? 'none',
            },
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
        if (!is_simple_object(value) || path.length === 0) {
            return // not pointing to a single row
        }

        // use the closest ancestor with an $operation as the current $operation. This handles operation inheritance
        const operation = path
            .map((el, i) => path.slice(0, path.length - i))
            .concat([[]]) // this is because we can also inherit operation from the root
            .map(path_slice =>
                deep_get([...path_slice, '$operation'], mutation)
            ) // check the operation at each path slice
            .find((el): el is string => typeof el === 'string') // find the first defined operation

        if (!operation) {
            throw new Error(
                `Could not find an inherited operation for ${JSON.stringify(
                    path
                )}`
            )
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
        const higher_operation =
            deep_get([...higher_path, '$operation'], mutation) ?? operation
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

        const higher_entity_is_parent = is_parent_entity(
            higher_entity,
            entity,
            orma_schema
        ) // in cases of self-referenced entities, this will return true. So they will be processed in regular order (top -> bottom for creates, bottom -> top for deletes)

        const parent_route_string = higher_entity_is_parent
            ? higher_route_string
            : route_string // regular nesting
        const child_route_string = higher_entity_is_parent
            ? route_string
            : higher_route_string // reverse nesting

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
            [key]: [...route_graph[key]],
        }
    }, {})
    const topological_ordering = toposort(toposort_graph)

    const mutate_plan = topological_ordering.map(route_strings =>
        route_strings.map(route_string => ({
            operation: string_to_path(route_string)[0] as operation,
            paths: paths_by_route[route_string],
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
