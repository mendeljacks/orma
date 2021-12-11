import { OrmaSchema } from '../types/schema_types'



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

// const test_schema = getA(test_schema_typed)

// test: can only put existing entities
// TODO: make this referenced tables type get all the referenced tables for an entity (so for products it returns vendors)

type keys = 'id' | 'vendor_id'

type t = typeof test_schema

type new_obj = {
    [entity in keys]: keyof typeof test_schema['products'][entity]
}

type t3 = 'products'

type t4 = t[t3]

// type t2 = ReferencedTables<typeof test_schema, t3>

// var obj: Query<t> = {}

// obj = { products: {}, vendors: {} } // good

// // // @ts-expect-error
// // obj = { a_fake_entity: {} } // bad

// // test: can only nest connected entities

// obj = { products: { vendors: {} } } // good
// obj = { products: { images: {} } } // good
// // @ ts-expect-error
// obj = { products: { image_urls: {} } } // bad

// // @ ts-expect-error
// obj = { products: { $indexes: {} } } // bad

// {
//     // parent referencing
//     type test = ReferencedParent<typeof test_schema, 'products'>

//     const good: test = 'vendors'
//     // @ts-expect-error
//     const bad: test = 'products'
// }

// {
//     // child referencing
//     type test = ReferencedChild<typeof test_schema, 'vendors'>

//     const good: test = 'products'
//     // @ts-expect-error
//     const bad: test = 'vendors'
// }

// {
//     // ref
//     type test = GetRefs<typeof test_schema, 'products' | 'vendors'>

//     const good: test = {
//         vendors: {

//         }
//     }
//     // @ts-expect-error
//     const bad: test = 'products'
// }
// {
//     // subquery nesting
//     type test = Subquery<typeof test_schema, 'products'>

//     const good: test = {
//         vendors: {

//         }
//     }
//     // @ts-expect-error
//     const bad: test = 'products'
// }

// type Ext<T extends never> = T
// type tt = Ext<{}>