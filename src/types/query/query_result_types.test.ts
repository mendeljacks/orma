import { as_orma_schema } from '../../introspector/introspector'
import { IsEqual } from '../helper_types'
import { QueryResult } from './query_result_types'
import { OrmaQuery } from './query_types'

const test = () => {
    const test_schema = as_orma_schema({
        products: {
            id: {
                data_type: 'int',
            },
            vendor_id: {
                data_type: 'bigint',
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
            name: {
                data_type: 'varchar',
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
            url: {
                data_type: 'varchar',
            },
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

    const query_response = <Query extends OrmaQuery<TestSchema>>(
        query: Query
    ): QueryResult<TestSchema, Query> => '' as any

    {
        // data props propagate as arrays
        const result = query_response({
            products: {
                $from: 'products',
                id: true,
                name: true,
            },
        })

        result.products.slice()
        result.products[0].id
        result.products[0].name

        // @ts-expect-error
        result.vendors
    }

    {
        // infers entity name from prop
        const result = query_response({
            products: {
                id: true,
            },
        })

        result.products.slice()
        result.products[0].id
    }

    {
        // allows prop renaming
        const result = query_response({
            products: {
                my_id: 'id',
            },
        })

        result.products.slice()
        const my_id = result.products[0].my_id
        const expect: IsEqual<typeof my_id, number> = true
    }

    {
        // allows nesting
        const result = query_response({
            products: {
                images: {
                    products: {
                        name: true,
                    },
                },
            },
        })

        result.products.slice()
        result.products[0].images[0].products[0].name
    }
}
