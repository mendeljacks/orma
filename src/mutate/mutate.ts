// import { find_last } from '../helpers/stable_sort'
import { error_type } from '../helpers/error_handling'
import { clone, deep_for_each, deep_get, deep_map, deep_set, last, type } from '../helpers/helpers'
import { push_path } from '../helpers/push_path'
import { get_parent_edges, get_primary_keys, get_unique_fields, is_parent_entity, is_reserved_keyword } from '../helpers/schema_helpers'
import { toposort } from '../helpers/toposort'
import { orma_schema } from '../introspector/introspector'
import { json_to_sql } from '../query/query'
// import { verify_foreign_keys } from './mutate_verifications'


export type mutate_function = (sql_strings: string[], sql_jsons: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>

export type operation = 'create' | 'update' | 'delete'

export interface mutate_functions {
    create: mutate_function
    update: mutate_function
    delete: mutate_function
}

// TODO: comment explaining how to set up mutation functions and what needs to be returned (need to return generated values)
export const orma_mutate = async (mutation, mutate_functions: mutate_functions, orma_schema: orma_schema) => {
    const mutate_plan = get_mutate_plan(mutation, orma_schema)
    const mutation_result = clone(mutation)

    for (const tier of mutate_plan) {
        await Promise.all(tier.map(async ({ operation, paths }) => {
            const command_jsons = get_command_jsons(operation, paths, mutation_result, orma_schema)
            const command_sqls = command_jsons.map(command_json => json_to_sql(command_jsons))
            const mutate_function = mutate_functions[operation]
            const results = await mutate_function(command_sqls, command_jsons)
            paths.forEach((path, i) => {
                deep_set(path, results[i], mutation_result)
            })
        }))
    }

    return mutation_result
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
 * Returns an array of json sql commands
 */
export const get_command_jsons = (operation: string, paths: (string | number)[][], mutation, orma_schema: orma_schema): Record<string, any>[] => {

    if (operation === 'update') {
        return get_update_jsons(paths, mutation, orma_schema)
    }

    if (operation === 'delete') {
        return get_delete_jsons(paths, mutation, orma_schema)
    }

    if (operation === 'create') {
        return get_create_jsons(paths, mutation, orma_schema)
    }

    throw new Error(`Unknown operation ${operation}`)

}

const get_update_jsons = (paths: (string | number)[][], mutation, orma_schema: orma_schema) => {
    if (paths.length === 0) {
        return []
    }

    const entity_name = path_to_entity_name(paths[0])

    const jsons = paths.map(path => {
        const record = deep_get(path, mutation)
        const identifying_keys = get_identifying_keys(entity_name, record, orma_schema)

        throw_identifying_key_errors('update', identifying_keys, path, mutation)

        const where = generate_record_where_clause(identifying_keys, record)

        const keys_to_set = Object.keys(record)
            .filter(key => !identifying_keys.includes(key))
            .filter(key => typeof (record[key]) !== 'object')
            .filter(key => !is_reserved_keyword(key))

        return {
            $update: entity_name,
            $set: keys_to_set.map(key => [key, record[key]]),
            $where: where
        }
    })

    return jsons
}

const get_delete_jsons = (paths: (string | number)[][], mutation, orma_schema: orma_schema) => {
    if (paths.length === 0) {
        return []
    }

    const entity_name = path_to_entity_name(paths[0])

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

    return jsons
}

const get_create_jsons = (paths: (string | number)[][], mutation, orma_schema: orma_schema) => {
    if (paths.length === 0) {
        return []
    }

    const entity_name = path_to_entity_name(paths[0])

    const records = paths.map(path => deep_get(path, mutation))

    // get insert keys by combining the keys from all records
    const insert_keys = paths.reduce((acc, path, i) => {
        const record = records[i]

        const keys_to_insert = Object.keys(record)
            .filter(key => typeof (record[key]) !== 'object')
            .filter(key => !is_reserved_keyword(key))

        keys_to_insert.forEach(key => acc.add(key))

        return acc
    }, new Set() as Set<string>)

    const values = paths.map((path, i) => {
        const record = records[i]
        const record_values = []
        for (const key of insert_keys) {
            record_values.push(record[key] ?? null)
        }
        return record_values
    })

    return [{
        $insert_into: [entity_name, insert_keys],
        $values: values
    }]

}

const generate_record_where_clause = (identifying_keys: string[], record: Record<string, unknown>) => {
    const where_clauses = identifying_keys.map(key => ({
        $eq: [key, record[key]]
    }))

    const where = where_clauses.length > 1 ? {
        and: where_clauses
    } : where_clauses?.[0]

    return where
}



const inject_foreign_keys = (entity_name, orma_schema, insert_keys) => {
    // when creating an entity, all foreign keys must be present. These can be taken from the user input
    const edges_to_parents = get_parent_edges(entity_name, orma_schema)
    const foreign_keys_to_parent = edges_to_parents.map(edge => edge.from_field)
    foreign_keys_to_parent.forEach(key => insert_keys.add(key))
}

const get_parent_path = (path: (number | string)[]) => {
    return typeof last(path) === 'number'
        ? path.slice(0, path.length - 2)
        : path.slice(0, path.length - 1)
}

const path_to_entity_name = (path: (number | string)[]) => {
    return typeof last(path) === 'number'
        ? path[path.length - 2] as string
        : last(path) as string
}

const get_identifying_keys = (entity_name: string, record: Record<string, any>, orma_schema: orma_schema) => {
    const primary_keys = get_primary_keys(entity_name, orma_schema)
    const has_primary_keys = primary_keys.every(primary_key => record[primary_key])
    if (has_primary_keys && primary_keys.length > 0) {
        return primary_keys
    }

    const unique_keys = get_unique_fields(entity_name, orma_schema)
    const included_unique_keys = unique_keys.filter(unique_key => record[unique_key])
    if (included_unique_keys.length === 1) { // if there are 2 or more unique keys, we cant use them since it would be ambiguous which we choose
        return included_unique_keys
    }

    return undefined
}

const throw_identifying_key_errors = (operation: string, identifying_keys: string[], path: (string | number)[], mutation) => {
    if (!identifying_keys || identifying_keys.length === 0) {
        throw {
            message: `Could not find primary keys or unique keys in record to ${operation}`,
            path: path,
            original_data: mutation,
            stack_trace: (new Error()).stack,
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
            .map(path_slice => deep_get([...path_slice, '$operation'], mutation))
            .find((el): el is string => typeof el === 'string')

        if (!operation) {
            throw new Error(`Could not find an inherited operation for ${JSON.stringify(path)}`)
        }

        const path_template = path.map(el => typeof el === 'number' ? 0 : el)
        const route = [operation, ...path_template]
        const route_string = JSON.stringify(route)

        // add path to paths_by_route
        if (!paths_by_route[route_string]) {
            paths_by_route[route_string] = []
        }
        paths_by_route[route_string].push(path)


        // make sure this ends up in the graph (and so in the mutate plan), even if it has no lower/higher tables
        if (!route_graph[route_string]) {
            route_graph[route_string] = new Set()
        }

        const higher_path = typeof last(path) === 'number'
            ? path.slice(0, path.length - 2) // need to remove the entity name and index template (the number 0)
            : path.slice(0, path.length - 1) // only remove the entity name

        if (higher_path.length === 0) {
            return //no parent to look at
        }

        // if higher row does not have $operation, it inherits the same operation as the current row
        const higher_operation = deep_get([...higher_path, '$operation'], mutation) ?? operation
        const higher_path_template = typeof last(path_template) === 'number'
            ? path_template.slice(0, path_template.length - 2) // need to remove the entity name and index template (the number 0)
            : path_template.slice(0, path_template.length - 1) // only remove the entity name

        const higher_route = [higher_operation, ...higher_path_template]
        const higher_route_string = JSON.stringify(higher_route)

        if (!route_graph[higher_route_string]) {
            route_graph[higher_route_string] = new Set()
        }

        const entity = typeof last(path) === 'number'
            ? path[path.length - 2] as string
            : last(path) as string

        const higher_entity = typeof last(higher_path) === 'number'
            ? higher_path[higher_path.length - 2] as string
            : last(higher_path) as string

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
            operation: JSON.parse(route_string)[0] as operation,
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