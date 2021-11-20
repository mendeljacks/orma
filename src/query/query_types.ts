import { orma_schema } from '../introspector/introspector';



const test_schema = {
    products: {
        id: {},
        vendor_id: {
            references: {
                vendors: {
                    id: {}
                }
            }
        }
    },
    vendors: {
        id: {}
    },
    images: {
        id: {},
        product_id: {
            references: {
                products: {
                    id: {}
                }
            }
        }
    },
    image_urls: {
        image_id: {
            references: {
                images: {
                    id: {}
                }
            }
        }
    }
} as const

// maps keys of unioned objects to all keys in there
type KeysOfUnion<T> = T extends T ? keyof T: never

type PossibleEntities<Schema extends orma_schema> = keyof Schema

type Query<Schema extends orma_schema> = {
    [entity in PossibleEntities<Schema>]?: Subquery<Schema, entity>
}

type Subquery<Schema extends orma_schema, EntityName extends PossibleEntities<Schema>> = {
    [entity in PossibleEntities<Schema>]?: Subquery<Schema, entity>
}

type ReferencedTables<
    Schema extends orma_schema, 
    EntityName extends PossibleEntities<Schema>
> = Schema[EntityName][keyof Schema[EntityName]]

// TODO: make this referenced tables type get all the referenced tables for an entity (so for products it returns vendors)

type keys = 'id' | 'vendor_id'


type t = typeof test_schema

type new_obj = {
    [entity in keys]: keyof typeof test_schema['products'][entity]
}

type t3 = 'products'

type t4 = t[t3]

type t2 = ReferencedTables<typeof test_schema, t3>


// test: can only put existing entities


var obj: Query<t> = {}

obj = { products: {}, vendors: {} } // good

// @ts-expect-error
obj = { a_fake_entity: {} } // bad


// test: can only nest connected entities

obj = { products: { vendors: {} }} // good
obj = { products: { images: {} }} // good
// @ ts-expect-error
obj = { products: { image_urls: {} }} // bad
