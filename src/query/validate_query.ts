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

export const validate_query = () => {
    
}