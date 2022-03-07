import { as_orma_schema } from '../../introspector/introspector'
import { IsEqual, IsExtends } from '../helper_types'
import { OrmaSchema } from '../schema_types'
import {
    AddSchemaTypes,
    IsSubquery,
    QueryResult,
    StripKeywords,
} from './query_result_types'
import { OrmaQuery } from './query_types'

const tests = () => {
    const test_schema = as_orma_schema({
        products: {
            id: {
                data_type: 'number',
            },
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
            quantity: {},
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
                data_type: 'string',
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

    const as_query = <T extends OrmaQuery<TestSchema>>(
        value: T
    ): QueryResult<TestSchema, T> => {
        return {} as QueryResult<TestSchema, T>
    }

    {
        // data props propagate as arrays
        const result = as_query({
            products: {
                id: true,
                vendor_id: true,
            },
        })

        result.products.slice()
        result.products[0].id
        result.products[0].vendor_id

        // @ts-expect-error
        result.vendors
    }

    {
        // handles deep nesting
        const result = as_query({
            products: {
                images: {
                    image_urls: {
                        $from: 'image_urls',
                    },
                },
            },
        })

        result.products[0].images[0].image_urls.slice()
    }

    {
        // works on computed field
        const result = as_query({
            products: {
                sum_quantity: {
                    $sum: 'quantity',
                },
            },
        })

        result.products[0].sum_quantity
    }

    {
        // ignores keywords
        const result = as_query({
            products: {
                id: true,
                $limit: 2,
            },
        })

        result.products[0].id
        // @ts-expect-error
        result.products[0].$limit
    }

    {
        // to make this recognize as a query, you would have to add a data field like id: true or
        // a $from: 'products' prop
        const result = as_query({
            products: {},
        })

        const expect: IsEqual<typeof result['products'], any> = true
    }

    {
        // propagates field types
        const result = as_query({
            products: {
                id: true,
            },
        })

        type FieldType = typeof result['products'][0]['id']

        const expect: IsEqual<FieldType, number> = true
    }

    {
        // handles renamed entities
        const result = as_query({
            my_images: {
                $from: 'images',
                url: true,
            },
        })

        type FieldType = typeof result['my_images'][0]['url']

        const expect: IsEqual<FieldType, string> = true
    }

    {
        type Test = {
            a: 12
            $b: 1
            c: {
                $x: 12
                y: [
                    {
                        z: 1
                        $q: 2
                    }
                ]
            }
            $d: {
                test: true
            }
        }

        type Stripped = StripKeywords<Test>
        const good: Stripped = {
            a: 12,
            c: {
                y: [
                    {
                        z: 1,
                    },
                ],
            },
        }

        const bad1: Stripped = {
            c: {
                y: [
                    {
                        // @ts-expect-error
                        $q: 2,
                    },
                ],
            },
        }

        const bad2: Stripped = {
            // @ts-expect-error
            $b: 1,
        }

        const bad3: Stripped = {
            // @ts-expect-error
            $d: {
                test: true,
            },
        }
    }

    {
        // has data props
        const good1: IsSubquery<{
            sum_quantity: {
                $sum: 'quantity'
            }
            variants: {}
            $limit: 1
        }> = true

        // has a $from prop
        const good2: IsSubquery<{
            $from: 'products'
        }> = true

        // this is technically not a subquery, since it has no data props
        const bad: IsSubquery<{
            $limit: 1
        }> = false

        // empty object is also not a subquery
        const bad2: IsSubquery<{}> = false
    }

    {
        // AddSchemaTypes
        {
            // handles simple types
            type test = AddSchemaTypes<
                TestSchema,
                {
                    products: {
                        id: true
                    }
                }
            >

            type IdType = test['products']['id']
            const expect: IsEqual<IdType, number> = true
        }
        {
            // respects $from clause
            type test = AddSchemaTypes<
                TestSchema,
                {
                    my_images: {
                        $from: 'images'
                        url: true
                    }
                }
            >

            type FieldType = test['my_images']['url']
            const expect: IsEqual<FieldType, string> = true
        }
        {
            // handles computed fields
            // computed fields have type any for now, although in future types should really
            // propagate through founctions like $sum
            type test = AddSchemaTypes<
                TestSchema,
                {
                    products: {
                        sum_quantity: {
                            $sum: 'quantity'
                        }
                    }
                }
            >

            type FieldType = test['products']['sum_quantity']
            const expect: IsEqual<FieldType, any> = true
        }
        {
            // handles mapped fields
            type test = AddSchemaTypes<
                TestSchema,
                {
                    products: {
                        my_id: 'id'
                    }
                }
            >

            type FieldType = test['products']['my_id']
            const expect: IsEqual<FieldType, number> = true
        }
    }
}
