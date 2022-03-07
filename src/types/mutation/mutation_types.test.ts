import { as_orma_schema } from '../../introspector/introspector'
import { GetFields } from '../schema_types'
import { OrmaMutation } from './mutation_types'

const test_schema = as_orma_schema({
    products: {
        id: {
            data_type: 'number',
        },
        vendor_id: {
            required: true,
            data_type: 'number',
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
            data_type: 'string',
        },
        $indexes: [],
    },
    vendors: {
        id: {},
    },
    images: {
        id: {},
        product_id: {
            required: true,
            references: {
                products: {
                    id: {},
                },
            },
        },
    },
    image_urls: {
        image_id: {
            required: true,
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
                    vendor_id: 12,
                    //@ts-expect-error
                    id: 'hi', // data type of id is 'number', so this is not allowed
                },
            ],
        }
    }
    {
        // required fields have to be included
        const t: Mutation = {
            $operation: 'create',
            products: [
                //@ts-expect-error
                {
                    $operation: 'create',
                },
            ],
        }
    }
    {
        
    }
}
