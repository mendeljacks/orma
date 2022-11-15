import { as_orma_schema } from '../../introspector/introspector'
import { IsEqual } from '../helper_types'
import { GetAllEdges, GetFieldType } from '../schema_types'
import { QueryResult } from './query_result_types'
import { OrmaQuery } from './query_types'

const test = () => {
    const test_schema = as_orma_schema({
        $entities: {
            products: {
                $fields: {
                    id: { data_type: 'int', not_null: true },
                    vendor_id: { data_type: 'bigint' },
                    location_id: {},
                    name: { data_type: 'varchar' },
                },
                $database_type: 'mysql',
                $indexes: [],
                $foreign_keys: [
                    {
                        from_field: 'vendor_id',
                        to_entity: 'vendors',
                        to_field: 'id',
                    },
                    {
                        from_field: 'location_id',
                        to_entity: 'locations',
                        to_field: 'id',
                    },
                ],
            },
            vendors: { $fields: { id: {} }, $database_type: 'mysql' },
            images: {
                $fields: {
                    id: {},
                    product_id: {},
                    url: { data_type: 'varchar' },
                },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'product_id',
                        to_entity: 'products',
                        to_field: 'id',
                    },
                ],
            },
            image_urls: {
                $fields: { image_id: {} },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'image_id',
                        to_entity: 'images',
                        to_field: 'id',
                    },
                ],
            },
            locations: { $fields: { id: {} }, $database_type: 'mysql' },
        },
        $cache: {
            $reversed_foreign_keys: {
                vendors: [
                    {
                        from_field: 'id',
                        to_entity: 'products',
                        to_field: 'vendor_id',
                    },
                ],
                locations: [
                    {
                        from_field: 'id',
                        to_entity: 'products',
                        to_field: 'location_id',
                    },
                ],
                products: [
                    {
                        from_field: 'id',
                        to_entity: 'images',
                        to_field: 'product_id',
                    },
                ],
                images: [
                    {
                        from_field: 'id',
                        to_entity: 'image_urls',
                        to_field: 'image_id',
                    },
                ],
            },
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
        type T = GetAllEdges<TestSchema, 'products'>

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
    {
        // handles null
        const result = query_response({
            products: {
                id: true,
                name: true,
            },
        })

        result.products.slice()
        result.products[0].id = 1
        //@ts-expect-error
        result.products[0].id = null
        result.products[0].name = null

        type T = GetFieldType<TestSchema, 'products', 'id'>
        type T2 = GetFieldType<TestSchema, 'products', 'name'>
    }
    {
        // excludes $ keywords
        const result = query_response({
            products: {
                id: true,
                $where: {
                    $eq: ['id', { $escape: 1 }],
                },
            },
        })

        result.products.slice()
        // @ts-expect-error
        result.products[0].$where

        type T = GetFieldType<TestSchema, 'products', 'id'>
        type T2 = GetFieldType<TestSchema, 'products', 'name'>
    }
}
