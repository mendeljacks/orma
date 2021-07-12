// import { find_last } from '../helpers/stable_sort'
import { deep_for_each, deep_get, deep_map, last, type } from '../helpers/helpers'
import { push_path } from '../helpers/push_path'
import { is_parent_entity } from '../helpers/schema_helpers'
import { toposort } from '../helpers/toposort'
import { orma_schema } from '../introspector/introspector'
import { verify_foreign_keys } from './mutate_verifications'


export const orma_mutate = async (mutation, orma_schema: orma_schema) => {
    const mutate_plan = get_mutate_plan(mutation, orma_schema)

    for (const paths of mutate_plan) {
        // const verification_errors = await verify_foreign_keys(mutation, path, orma_schema)

        // other verifications here
    }



    for (const paths of mutate_plan) {
        const results = await Promise.all(paths.map(async path => {


        }))
    }
}




export const get_mutate_plan = (mutation, orma_schema: orma_schema): string[][] => {
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
        We will now form one or zero edges in the route_graph based on the current and higher operations. 
        The table summarizes possible combinations:

        current_operation | higher_operation | result
        create            | create           | form a edge from parent -> child (parent goes first regardless of whether the parent is the current entity or the higher entity)
        create            | update           | no edge formed (no guarantees on order of operations)
        update            | update           | no edge formed (updates can be processed in any order since they dont rely on other data being/not being there)
        delete            | delete           | form a edge from child -> parent (deletes are processed child first)
        delete            | update           | no edge formed (no guarantees on order of operations)

        (some combinations like current = update, parent = create since they are not allowed in a mutation)
        
        So basically we only form a edge on the graph when the current and higher opeartions are the same and are not 'update'.
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
            operation: JSON.parse(route_string)[0],
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