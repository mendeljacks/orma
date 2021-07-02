



// interface simple_types {
//     string: string
//     number: number
// }

// type Entities<schema extends orma_schema> = {
//     [entity_key in keyof schema['entities']]: {
//         [field_key in keyof schema['entities'][entity_key]['fields']]: simple_types[schema['entities'][entity_key]['fields'][field_key]['data_type']]
//     }
// }

// // const a: Entities<typeof readable_table_info> = {

// // }

// type test1 = Entities<typeof readable_table_info>





// // Forces T to be part of U - used to prevent people putting random props
// export type Subset<T, U> = { [key in keyof T]: key extends keyof U ? T[key] : never; }
// // Returns type with only props from T and U
// type IntersectingTypes<T, U> = { [K in Extract<keyof T, keyof U>]: T[K] }

// // no3rd_query input
// export type RootQuery = { meta?: {}, include_vendors?: any } & { [key in keyof Entities]?: MakeQueryFragment<key>[key] }

// type MakeQueryFragment<EntityName extends keyof Entities> = {
//     [key in EntityName]: {
//         select?: keyof Entities[EntityName] | Array<keyof Entities[EntityName]> | '*' | '*'[],
//         where?: any,
//         offset?: number,
//         limit?: number,
//         group_by?: any,
//     } & {
//         [key in Connections[EntityName]]?: MakeQueryFragment<key>[key]
//     }
// }
// // Output Response Type
// // {products: {select: ['title']}} --> {products: {title: string}}

// type GetArraySelects<T, EntityName extends keyof Entities> =
//     T extends
//     { select: Array<keyof Entities[EntityName]> }
//     |
//     { select?: Array<keyof Entities[EntityName]> }
//     ? { [key in T['select'][number]]:
//         key extends keyof Entities[EntityName]
//         ? Entities[EntityName][key]
//         : never
//     }
//     : T extends
//     { select: keyof Entities[EntityName] }
//     |
//     { select?: keyof Entities[EntityName] }
//     ? { [key in T['select']]:
//         key extends keyof Entities[EntityName]
//         ? Entities[EntityName][key]
//         : never
//     }
//     : {
//         [key in keyof Entities[EntityName]]: Entities[EntityName][key]
//     }




// type a = { select: 'hello', where: 'there' }
// type b = { select: 'hello' }
// type test = a extends b ? 'yes' : 'no'



// type Selects<T, EntityName extends keyof Entities> =
//     T extends { select: ['*'] } | { select?: '*' } | { select: ['*'] } | { select?: ['*'] }
//     ? {
//         [key in keyof Entities[EntityName]]: Entities[EntityName][key]
//     }
//     : GetArraySelects<T, EntityName>



// type hov = Selects<{ select?: 'title', where: { eq: [1, 2] }, variants: { select: 'id' } }, 'products'>
// type hov1 = Selects<{ select?: ['created_at', 'title'], variants: { select: 'id' } }, 'products'>
// type hov2 = Selects<{ select: ['*'], variants: { select: ['sku'], }, product_in_stores: { select: ['store_id'] } }, 'products'>
// type hov22 = Selects<{ variants: { select: ['sku'], }, product_in_stores: { select: ['store_id'] } }, 'products'>

// type FilterForEntities<QueryFragment> =
//     IntersectingTypes<QueryFragment, { [key in keyof Entities]: boolean }>

// // {meta: {}, products: {product_in_stores: {stores: {}}, variants: {}}, variants: {}}
// // --> {products: [{title: '', product_in_stores: [{stores: [{}]}], variants:[{}]}], variants: [{}]}
// export type makeResponse2<QueryFragment> = {
//     [EntityName in keyof FilterForEntities<QueryFragment>]:
//     Array<
//         Selects<QueryFragment[EntityName], EntityName>
//         &
//         {
//             [ChildEntityName in keyof FilterForEntities<QueryFragment[EntityName]>]:
//             makeResponse2<
//                 QueryFragment[EntityName]
//             >[ChildEntityName]

//         }
//     >

// }
// type hover = makeResponse2<{
//     meta: {},
//     products: {
//         select: ['title'],
//         variants: {
//             select: ['sku'],
//             products: {
//                 select: ['created_at']
//             }
//         },
//         product_in_stores: {
//             select: ['store_id'],

//         }
//     }
//     variants: { select: 'sku' },
// }>

// type hover2 = makeResponse2<{
//     meta: {},
//     variants: { select: 'sku' },
//     products: {
//         select: ['title'],
//         variants: {
//             select: ['sku'],
//             products: {
//                 select: ['created_at']
//             }
//         },
//         product_in_stores: {
//             select: ['store_id'],

//         }
//     }
// }>

// type hover22 = makeResponse2<{
//     product_in_stores: {
//         select: ['product_id']
//     },
//     meta: "",
//     products: {
//         select: ['id'],
//         variants: {
//             select: 'id'
//             products: {
//                 select: ['title'],
//                 variants: {
//                     select: ['sku']
//                 }
//             }
//         }
//     },
// }>

// const hover3: makeResponse2<{
//     products: {
//         select: "title"[];
//         variants: {
//             select: "sku"[];
//             products: {
//                 select: "created_at"[];
//             };
//         };
//         product_in_stores: {
//             select: "store_id"[];
//         };
//     }
// }> = {
//     products: [{
//         title: 'test',
//         product_in_stores: [{ store_id: 3 }],
//         variants: [{ sku: 'test', products: [{ created_at: 'e' }] }]
//     }]
// }
// hover3.products[0].product_in_stores[0].store_id
//     ; (async () => {


//         const myp = await no3rd_query({
//             products: {
//                 select: ['title'],
//                 variants: {
//                     select: ['sku'],
//                     products: {
//                         select: ['created_at']
//                     }
//                 },
//                 product_in_stores: {
//                     select: ['store_id'],

//                 }
//             }
//         })
//         myp.products[0]


//         myp.products[0].variants[0]
//         myp.products[0] // I think the select is because no omit on queryfrag
//         myp.products[0].variants[0].products[0]
//         myp.products[0].product_in_stores[0]
//         myp.products[0].variants[0].products[0].created_at

//         const res = await no3rd_query({
//             product_in_stores: {
//                 select: ['product_id']
//             },
//             meta: "",
//             products: {
//                 select: ['id'], variants: {
//                     products: {
//                         select: ['title'],
//                         variants: {
//                             select: ['sku']
//                         }
//                     }
//                 }
//             },
//         })

//         const myp2 = await no3rd_query({
//             meta: {},
//             variants: {
//                 select: ['id'],
//             }
//         })


//         // Typescript tests
//         // Good
//         myp2.variants[0].id
//         res.products[0].id
//         res.product_in_stores[0].product_id
//         res.products[0].variants[0].products[0].title


//         // Bad
//         // myp2.variants[0].products


//     })()




// // Response Type Criteria:
// // 7. should not allow other tables to be put in there


// // 1. tables with no children also work
// // 2. select response works with array or not array
// // 3. elements only show items that are in the select
// // 4. elements only show children that are in the body
// // 5. nested children only select what they should (no phantom tables)


// // Good Queries
// // 1. multi elements on root level
// const good_query1 = no3rd_query({ products: {}, variants: { products: {} } })
// // 2. elements only allow selects for that element
// const good_query2 = no3rd_query({ products: { select: ['id', 'title'] } })
// // 3. elements only allow children/parent connections besides keywords
// const good_query3 = no3rd_query({ products: { variants: { products: { select: ['title'] } } } })
// // 4. elements allow keywords
// const good_query4 = no3rd_query({ products: { limit: 3 } })
// // 5. select works with array or not array
// const good_query5 = no3rd_query({ products: { select: 'created_at' } })
// // 6. tables with no children also work
// const good_query6 = no3rd_query({ product_in_stores: {}, products: { product_in_stores: {} } })

// //-------------------------------------------------------------------------------
// // Invalid queries
// // 1. elements only allow selects for that element
// // const bad_query1 = no3rd_query({ product_in_stores: { select: ['title'] } })
// // const bad_query2 = no3rd_query({ product_in_stores: { select: ['id'] }, extension: {} })
// // 2. elements only allow children/parent connections besides keywords
// // const bad_query3 = no3rd_query({ product_in_stores: { variants: { products: { select: ['title'] } } } })




// const mutationtest: Mutation = {
//     meta: { operation: 'create' },
//     products: [{
//         vendor_id: 23,
//         title: 'Laptop Case',
//         variants: [{
//             sku: 'mysky',
//             variant_in_stores: [{
//                 wam: 2,
//                 store_id: 1
//             }]
//         }]

//     }]
// }
// type RecursivePartial<T> = {
//     [P in keyof T]?:
//     T[P] extends (infer U)[] ? RecursivePartial<U>[] :
//     T[P] extends object ? RecursivePartial<T[P]> :
//     T[P];
// };
// type testmes = Pick<Entities, Connections['products']>
// // No3rd Mutate
// export type Mutation = {
//     meta: {
//         operation: 'create' | 'update' | 'delete'
//     }
//     dry_run?: boolean
// } &
//     {
//         [key in keyof Entities]?: Array<Partial<Entities[key]> & RecursivePartial<Pick<Entities, Connections[key]>>>
//     }

// export type MutationResponse<T extends Mutation> = {
//     [key in keyof Entities]?: Array<Partial<Entities[key]> & RecursivePartial<Pick<Entities, Connections[key]>>>
// }