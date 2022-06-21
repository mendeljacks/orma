// import { expect } from 'chai'
// import { describe, test } from 'mocha'
// import { clone, last } from '../../../helpers/helpers'
// import { OrmaSchema } from '../../../introspector/introspector'
// import { orma_mutate } from '../../mutate'
// import { apply_guid_macro } from '../guid_macro'

// const test_guid_mutation = {
//     variants: [
//         {
//             inventory_adjustments: [{ id: { $guid: 1 } }],
//             shipment_items: [
//                 {
//                     shipment_items_received: [
//                         {
//                             inventory_adjustment_id: { $guid: 1 },
//                         },
//                     ],
//                 },
//             ],
//         },
//     ],
// }
// export const mysql_function = async statements => [[]]

// describe('Guid', () => {
//     test(apply_guid_macro.name, () => {
//         const mutation = clone(test_guid_mutation)
//         const { guid_by_path, paths_by_guid } = apply_guid_macro(mutation)

//         const mutated_mutation = {
//             variants: [
//                 {
//                     inventory_adjustments: [{}],
//                     shipment_items: [
//                         {
//                             shipment_items_received: [{}],
//                         },
//                     ],
//                 },
//             ],
//         }
//         const expected_guid_by_path = {
//             '["variants",0,"inventory_adjustments",0]': {
//                 column_name: 'id',
//                 guid: 1,
//             },
//             '["variants",0,"shipment_items",0,"shipment_items_received",0]': {
//                 column_name: 'inventory_adjustment_id',
//                 guid: 1,
//             },
//         }

//         const expected_paths_by_guid = {
//             '1': [
//                 '["variants",0,"inventory_adjustments",0]',
//                 '["variants",0,"shipment_items",0,"shipment_items_received",0]',
//             ],
//         }

//         expect(mutation).to.deep.equal(mutated_mutation)
//         expect(guid_by_path).to.deep.equal(expected_guid_by_path)
//         expect(paths_by_guid).to.deep.equal(expected_paths_by_guid)
//     })
//     test('Propagates guids', async () => {
//         // In this schema a circular dependency is created
//         // shipment_items_received has two parents
//         // Guid is useful to specify that it is the same entity appearing in multiple places in the mutation
//         const orma_schema: OrmaSchema = {
//             variants: {
//                 id: { primary_key: true, not_null: true },
//                 resource_id: { not_null: true },
//                 $indexes: [
//                     {
//                         index_name: 'unique',
//                         fields: ['resource_id'],
//                         is_unique: true,
//                     },
//                 ],
//             },
//             shipment_items: {
//                 id: { primary_key: true, not_null: true },
//                 variant_id: { references: { variants: { id: {} } } },
//                 resource_id: { not_null: true },
//                 $indexes: [
//                     {
//                         index_name: 'unique',
//                         fields: ['resource_id'],
//                         is_unique: true,
//                     },
//                 ],
//             },
//             inventory_adjustments: {
//                 id: { primary_key: true, not_null: true },
//                 resource_id: { not_null: true },
//                 variant_id: { references: { variants: { id: {} } } },
//                 $indexes: [
//                     {
//                         index_name: 'unique',
//                         fields: ['resource_id'],
//                         is_unique: true,
//                     },
//                 ],
//             },
//             shipment_items_received: {
//                 id: { primary_key: true, not_null: true },
//                 inventory_adjustment_id: {
//                     references: { inventory_adjustments: { id: {} } },
//                 },
//                 shipment_item_id: {
//                     references: { shipment_items: { id: {} } },
//                 },
//                 resource_id: { not_null: true },
//                 $indexes: [
//                     {
//                         index_name: 'unique',
//                         fields: ['resource_id'],
//                         is_unique: true,
//                     },
//                 ],
//             },
//         }

//         const mutation = {
//             $operation: 'create',
//             variants: [
//                 {
//                     resource_id: 'variants',
//                     inventory_adjustments: [
//                         {
//                             id: { $guid: 11 },
//                             resource_id: 'inventory_adjustments',
//                         },
//                     ],
//                     shipment_items: [
//                         {
//                             resource_id: 'shipment_items',
//                             shipment_items_received: [
//                                 {
//                                     inventory_adjustment_id: { $guid: 11 },
//                                     resource_id: 'shipment_items_received',
//                                 },
//                             ],
//                         },
//                     ],
//                 },
//             ],
//         }

//         let query_result_maker = [
//             [{ id: 1, resource_id: 'variants' }],
//             [{ id: 11, resource_id: 'inventory_adjustments' }],
//             [{ id: 12, resource_id: 'shipment_items' }],
//             [
//                 {
//                     id: 111,
//                     resource_id: 'shipment_items_received',
//                 },
//             ],
//         ]
//         const mysql_fn = async statements => {
//             let output = statements.map(statement => {
//                 let result = query_result_maker.find(
//                     q => q[0].resource_id === last(statement.route)
//                 )
//                 return result
//             })
//             return output
//         }

//         const results = await orma_mutate(mutation, mysql_fn, orma_schema)

//         let expected = {
//             $operation: 'create',
//             variants: [
//                 {
//                     resource_id: 'variants',
//                     inventory_adjustments: [
//                         {
//                             resource_id: 'inventory_adjustments',
//                             $operation: 'create',
//                             id: 11,
//                             variant_id: 1,
//                         },
//                     ],
//                     shipment_items: [
//                         {
//                             resource_id: 'shipment_items',
//                             shipment_items_received: [
//                                 {
//                                     resource_id: 'shipment_items_received',
//                                     $operation: 'create',
//                                     shipment_item_id: 12,
//                                     inventory_adjustment_id: 11,
//                                 },
//                             ],
//                             $operation: 'create',
//                             id: 12,
//                             variant_id: 1,
//                         },
//                     ],
//                     $operation: 'create',
//                     id: 1,
//                 },
//             ],
//         }

//         expect(results).to.deep.equal(expected)
//     })
// })
