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

interface validation_response {
    query: any
    errors: validation_error[]
}

interface validation_error {
    path: (string | number)[]
    message,
    additional_info?: {}
    recommendation?: string
}

export const validator = (query, schema): validation_response => {

    


    // check the keys of a query/subquery - including making sure each field has a place to take its data from
    // e.g. products: { sku: true } is invalid but products: { sku: 'title' } is fine
    // also subqueries products: { id: true }
    // also function like { $sum: 'quantity' }, so quantity needs to be valid

    
}

export const validate_function_fields = (query, subquery_path: string[], orma_schema: orma_schema) => {
    // recursively check valid sql functions like $sum or $avg
    // check function parameters are good (e.g. field names are real field names in $sum: 'quantity')
}

export const validate_where = (query, subquery_path: string[], orma_schema: orma_schema) => {
    // allowed keys (but only one), e.g. $eq, $and, $any
    // correct parameters ($and gets infinite where clauses as parameters, $eq gets first column name then primitive value or { $field: field_name })
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