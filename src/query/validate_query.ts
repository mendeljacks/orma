import { error_type } from "../helpers/error_handling"
import { deep_for_each, last } from "../helpers/helpers"
import { field_exists, get_direct_edges, get_field_names } from "../helpers/schema_helpers"
/*

query {
    meta: {
        where
        having
        from // valid child
        limit // number
        offset // number
        group_by // array of valid field names
        order_by: ({ asc: field_name } | { desc: field_name}) []
        using?
    }
    [keys]: { query object } | true | 'string'

    shmu: 'sku' // renamed field
    sku: false // not included
    sku: true // included

    // subquery
    variants: { 
        ...fields
    }

    // renamed subquery
    my_variants: {
        meta: {
            from: 'variants'
        }
    }

    variants: {
        id: true
    }

    variants: {
        $id: {}
    }

    variants: {
        sum: 'id'
    }

    // function field
    total_quantity: {
        sum: 'quantity'
    }

    total_quantity: {
        fn: ['sum', 'quantity']
    }

    {
        and: [{}, {}, {}]
    }

    {
        fn: ['and', {}, {}]
    }
}

{
    function_name: [arguments]
}

{
    key_in_the_response_object: what_it_is
}


?? way to indicate/validate array subqueries, object subqueries or single-value field subqueries

cant nest things on to a parent with group_by if the nesting field is not included in the group_by


{
    any: ['variants', { query object on variants}]
}

->

{
    in: {
        where: {
            in: ...
        }
    }
}

{
    $any
}

{
    $descends
}


{
    where: {
        $and: [{
            $any: 
        }]
    }
}

{
    $path: [['variants', '*', 'vendors'], {
        where clause, but its a where clause for vendors
    }]
} // tbd based on implementation


{
    products: {
        variants: {
            select: []
            from: 'variants'
            where: {
                in: ['product_id', ${ the parent id }]
            }
        }
    }
}

{
    $and: [{ where clause }]
    $or: [{ where clause }]
}

{
    $eq: ['id', 'sku']
}

{
    $eq: ['id', { sku: true }]
}

{
    $gt
    $lt
    $gte
    $lte
    $like: ['id', '%asd']
}

{
    
}


=


*/

import { orma_schema } from "../introspector/introspector"
import { get_real_entity_name, get_real_parent_name, is_subquery } from "./query"

export const validator = (query, schema): error_type[] => {

    let errors: error_type[] = []

    // Walk the query
    deep_for_each(query, (val, path) => {

        const is_boolean_resolver = val === true
        const is_virtual_column_resolver = typeof val === 'object' && !is_subquery(val)
        const is_subquery_resolver = typeof val === 'object' && is_subquery(val)

        if (is_boolean_resolver) {
            const error = validate_field_exists(val, path, schema, query)
            if (error) errors.push(error)
        }
        
        if (is_virtual_column_resolver) {
            const is_renamed_field = '$field' in val
            if (is_renamed_field) {
                const error = ensure_field_alone(val, path, query)
                if (error) errors.push(error)
                
                const error2 = ensure_field_exists(val, path, query, schema)
                if (error2) errors.push(error2)

            }
        }

        if (is_subquery_resolver) {
            const error = validate_edges(path, query, schema)
            if (error) errors.push(error)

        }


    })



    // check the keys of a query/subquery - including making sure each field has a place to take its data from
    // e.g. products: { sku: true } is invalid but products: { sku: 'title' } is fine
    // also subqueries products: { id: true }
    // also function like { $sum: 'quantity' }, so quantity needs to be valid
    return errors

}

const validate_edges = (path, query, schema) => {
    
    if (path.length > 1) {
        const parent_name = get_real_parent_name(path, query)
        const entity_name = get_real_entity_name(path, query)
        const direct_edges = get_direct_edges(parent_name, entity_name, schema)
        if (direct_edges.length === 0) {
            const error: error_type = {
                message: `${parent_name} is not connected to ${entity_name}.`,
                path: path, 
                original_data: query,
            }
            return error
        }

    }
}

const ensure_field_exists = (val, path: (string | number)[], query, schema: orma_schema) => {
    const parent_entity = get_real_parent_name(path, query)
    const original_field = val['$field']
    if (typeof original_field !== 'string' || !schema[parent_entity][original_field]) {
        const error: error_type = {
            message: `$field must be a string which exists in ${ parent_entity }`,
            original_data: query,
            path: path
        }
        return error
    }
}

const ensure_field_alone = (val, path: (string | number)[], query) => {
    if (Object.keys(val).length !== 1 || Object.keys(val)[0] !== '$field') {
        const error: error_type = {
            message: `$field must be the only key when renaming a field`,
            original_data: query,
            path: path
        }
        return error
    }

}

const validate_field_exists = (val, path: (string | number)[], schema: orma_schema, query) => {
    // User is requesting a specific field be in the response
    const parent_entity = get_real_parent_name(path, query)
    const requested_field = last(path)

    if (!field_exists(parent_entity, requested_field, schema)) {
        const error: error_type = {
            message: `Field ${ requested_field } does not exist on entity ${ parent_entity }`,
            path: path,
            original_data: query,
        }
        return error
    }

    return
}


export const validate_function_fields = (query, subquery_path: string[], orma_schema: orma_schema) => {
    // recursively check valid sql functions like $sum or $avg
    // check function parameters are good (e.g. field names are real field names in $sum: 'quantity')
}

export const validate_where = (query, subquery_path: string[], orma_schema: orma_schema) => {
    // allowed keys (but only one), e.g. $eq, $and, $any
    // correct parameters ($and gets infinite where clauses as parameters, $eq gets first field name then primitive value or { $field: field_name })
    // subqueries change 

    // also $having is the same
}


export const validate_group_by = (query, subquery_path: string[], orma_schema: orma_schema) => {
    // valid keys
}

export const validate_order_by = (query, subquery_path: string[], orma_schema: orma_schema) => {
    // valid keys
}

export const validate_pagination = (query, subquery_path: string[], orma_schema: orma_schema) => {
    // limit and offset are positive numbers
}



/*

{
    $where: {
        $any_macro: [['variants', 'images'], {
            {$shmeq: true }
        }]
    }
}

{
    $where: {
        $in: ['product_id', {
            $where: {
                { $shmeq: true }
            }
        }]
    }
}

 */