import { OrmaSchema } from '../../introspector/introspector'
import { as_orma_query } from '../../query/query'
import { GetAllEntities, GetFields } from '../schema_types'
import { OrmaQuery, Subquery, WhereConnected } from './query_types'

const getA = <K extends OrmaSchema>(a: K) => a

const test_schema = getA({
    products: {
        id: {},
        vendor_id: {
            references: {
                vendors: {
                    id: {},
                },
            },
        },
        location_id: {
            references: {
                locations: {
                    id: {},
                },
            },
        },
        $indexes: [],
    },
    vendors: {
        id: {},
    },
    images: {
        id: {},
        product_id: {
            references: {
                products: {
                    id: {},
                },
            },
        },
        url: {},
    },
    image_urls: {
        image_id: {
            references: {
                images: {
                    id: {},
                },
            },
        },
    },
    locations: {
        id: {},
    },
} as const)

type TestSchema = typeof test_schema
const as_test_query = <Query extends OrmaQuery<TestSchema, Query>>(
    query: Query
) => query

{
    // test fields
    type test = OrmaQuery<TestSchema>

    const good = as_test_query({
        products: {
            id: 'location_id',
            location_id: true,
            vendor_id: {
                $sum: 'id',
            },
        },
    })

    const bad1 = as_test_query({
        products: {
            // @ts-expect-error
            id: 'not_a_field',
            // @ts-expect-error
            location_id: 0,
        },
    })
}

{
    // test subqueries
    type test = OrmaQuery<TestSchema>

    // known root entities
    const good1 = as_test_query({
        images: {
            url: true,
        },
        vendors: {
            $from: 'vendors',
        },
    })

    // unknown root entities, has type inference based on $from
    const good2 = as_test_query({
        my_images: {
            $from: 'images',
            url: true,
        },
    })

    // nested subqueries
    const good3: OrmaQuery<TestSchema> = {
        my_images: {
            $from: 'images',
            products: {
                vendors: {
                    products: {
                        id: true,
                    },
                },
            },
        },
        images: {
            products: {
                id: true,
            },
        },
    }

    // orma actually doesnt allow this
    const good6 = as_test_query({
        products: {
            asdasdas: true,
        },
    })

    // orma actually doesnt allow this, since in this case a $from clause must
    // be provided, but the types allow this since I can't figure out
    // how to disallow it without ruining other parts of the type
    const good4 = as_test_query({
        my_images: {
            url: true,
        },
    })

    // orma would not allow this, since regular nested fields cant start with $,
    // but I cant get typescript to only apply virtual fields type to strings
    // starting with $. I tried, but that basically caused the type checker
    // to become very unstable (ignoring types in some places but not others etc.)
    // I believe this is something to do with the way I tried it (enumerating ever
    // alphanumeric character except $) overloading the type checker with too
    // many code paths, but who knows for sure
    const good5 = as_test_query({
        products: {
            $sum: 'id',
        },
    })

    // searching products under the key images is disallowed on a type level.
    // Orma allows this, but I couldnt figure out how to be able to do this
    // and also have good intellisense (when I tried this, intellises for
    // { images: { ... }} would list every field of every entity rather than just
    // images, since technically you could do { images: { $from: 'products' }} and
    // then just put product fields on). So since this is an uncommon usecase,
    // if needed a user would just have to ts-ignore this (and potentially lost
    // typing on all subqueries of images)
    const b = as_test_query({
        images: {
            // @ts-expect-error
            $from: 'products',
            id: true,
        },
    })
}

{
    // test pagination
    type test = OrmaQuery<TestSchema>
    const good = as_test_query({
        products: {
            $limit: 1,
            $offset: 2,
        },
    })
}

{
    // test group by
    type test = OrmaQuery<TestSchema>
    const good = as_test_query({
        products: {
            $group_by: [
                'id',
                'asdasdasd',
                {
                    $sum: 'id',
                },
            ],
        },
    })
}

{
    // test order by
    type test = OrmaQuery<TestSchema>
    const good = as_test_query({
        products: {
            $order_by: [
                'id',
                {
                    $asc: 'location_id',
                },
                {
                    $desc: 'asdasdasdsad',
                },
                'asdjaskdhasjd',
            ],
        },
    })

    const bad1 = as_test_query({
        products: {
            // @ts-expect-error
            $order_by: 'id',
        },
    })

    const bad2 = as_test_query({
        products: {
            $order_by: [
                {
                    // @ts-expect-error
                    $not_a_real_keyword: 'id',
                },
            ],
        },
    })
}

{
    // handles where clause
    const good: OrmaQuery<TestSchema> = {
        products: {
            id: true,
            $where: {
                $eq: ['id', { $escape: true }],
            },
        },
    }
}

{
    // handles $where_connected macro
    const good = as_test_query({
        $where_connected: [
            {
                $entity: 'products',
                $field: 'id',
                $values: [1, 'a'],
            },
        ],
    })

    const bad = as_test_query({
        $where_connected: [
            // @ts-expect-error
            {
                $entity: 'products',
                $field: 'url', // this is invalid since url is not a field of products
                $values: [1, 'a'],
            },
        ],
    })
}

{
    const testing = as_test_query({
        products: {
            
        }
    } as const)

    const as_test_subquery = <S extends Subquery<TestSchema, S, 'products', false>>(
        query: S
    ) => query

    const t2 = as_test_subquery({asdas: true})
}
