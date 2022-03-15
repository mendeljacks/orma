import { as_orma_schema } from '../../introspector/introspector'
import { GetFields, GetFieldType, GetParentEdges } from '../schema_types'
import { FieldType, OrmaMutation } from './mutation_types'

const test_schema = as_orma_schema({
    products: {
        id: {
            data_type: 'int',
        },
        vendor_id: {
            data_type: 'int',
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
        nadescriptionme: {
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
}
