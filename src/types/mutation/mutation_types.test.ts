import { GlobalTestMutation, GlobalTestSchema } from '../../helpers/tests/global_test_schema'
import { as_orma_schema } from '../../schema/introspector'
import { GetAllEdges, GetParentEdges } from '../schema/schema_helper_types'
import { ForeignKeyFieldsObj, OrmaMutation } from './mutation_types'

const test_schema = as_orma_schema({
    $entities: {
        products: {
            $fields: {
                id: { data_type: 'int' },
                vendor_id: { data_type: 'int' },
                location_id: {},
                name: { data_type: 'varchar' },
                description: { data_type: 'varchar' },
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
            $fields: { id: {}, product_id: {} },
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
                { from_field: 'image_id', to_entity: 'images', to_field: 'id' },
            ],
        },
    },
    $cache: {
        $reversed_foreign_keys: {
            vendors: [
                {
                    from_entity: 'vendors',
                    from_field: 'id',
                    to_entity: 'products',
                    to_field: 'vendor_id',
                },
            ],
            locations: [
                {
                    from_entity: 'locations',
                    from_field: 'id',
                    to_entity: 'products',
                    to_field: 'location_id',
                },
            ],
            products: [
                {
                    from_entity: 'products',
                    from_field: 'id',
                    to_entity: 'images',
                    to_field: 'product_id',
                },
            ],
            images: [
                {
                    from_entity: 'images',
                    from_field: 'id',
                    to_entity: 'image_urls',
                    to_field: 'image_id',
                },
            ],
        },
    },
} as const)

type TestSchema = typeof test_schema
type Mutation = OrmaMutation<TestSchema>

const tests = () => {
    {
        // has root level entities
        const t: Mutation = {
            $operation: 'create',
            products: [],
            images: [],
        }
    }
    {
        // disallow non entities
        // @ts-expect-error
        const t: Mutation = { $operation: 'create', not_an_entity: [] }
    }
    {
        // respects data type
        const t: Mutation = {
            $operation: 'create',
            products: [
                {
                    $operation: 'create',
                    name: '12',
                    //@ts-expect-error
                    id: 'hi', // data type of id is 'number', so this is not allowed
                },
            ],
        }
        type T = GetParentEdges<TestSchema, 'products'>
    }
    {
        // required fields have to be included
        // const t: Mutation = {
        //     $operation: 'create',
        //     products: [
        //         //@ts-expect-error
        //         {
        //             $operation: 'create',
        //         },
        //     ],
        // }
    }
    // check top level mutate
    // check first record needs op if no top level
    // check nested ops
    // check operation combos
    {
        // can have top level operation
        const t: Mutation = {
            $operation: 'create',
            image_urls: [
                {
                    image_id: 12,
                },
            ],
        }
    }
    {
        // requires an operation if there is no parent operation
        // @ts-expect-error
        const t: Mutation = {
            image_urls: [
                {
                    // $operation required here
                    image_id: 12,
                },
            ],
        }
    }
    {
        // // respects operation cascading
        // const t: Mutation = {
        //     image_urls: [{
        //         $operation: 'create',
        //         images: []
        //     }]
        // }
    }
    {
        // respects operation cascading
        const t: ForeignKeyFieldsObj<GlobalTestSchema, 'posts', GetAllEdges<GlobalTestSchema, 'posts'>> = {
            comments: [{
                
            }]
        }
    }
}
