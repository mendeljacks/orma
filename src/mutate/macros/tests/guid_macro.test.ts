import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../../../helpers/helpers'
import { orma_schema } from '../../../introspector/introspector'
import { orma_mutate } from '../../mutate'
import { apply_guid_macro } from '../guid_macro'

const test_guid_mutation = {
    variants: [
        {
            inventory_adjustments: [{ id: { $guid: 1 } }],
            shipment_items: [
                {
                    shipment_items_received: [
                        {
                            inventory_adjustment_id: { $guid: 1 },
                        },
                    ],
                },
            ],
        },
    ],
}
export const mysql_function = async statements => [[]]

describe('Guid', () => {
    test(apply_guid_macro.name, () => {
        const mutation = clone(test_guid_mutation)
        const { guid_map } = apply_guid_macro(mutation)

        const mutated_mutation = {
            variants: [
                {
                    inventory_adjustments: [{}],
                    shipment_items: [
                        {
                            shipment_items_received: [{}],
                        },
                    ],
                },
            ],
        }
        const expected_guid_map = {
            '["variants",0,"inventory_adjustments",0,"id","$guid"]': 1,
            '["variants",0,"shipment_items",0,"shipment_items_received",0,"inventory_adjustment_id","$guid"]': 1,
        }

        expect(mutation).to.deep.equal(mutated_mutation)
        expect(guid_map).to.deep.equal(expected_guid_map)
    })
    test.only('Propagates guids', async () => {
        // const test_statements = [
        //     {
        //         paths: [['variants', 0, 'inventory_adjustments', 0]],
        //         route: ['variants', 'inventory_adjustments'],
        //     },
        //     {
        //         paths: [['variants', 0, 'shipment_items', 0]],
        //         route: ['variants', 'shipment_items'],
        //     },
        // ]

        // In this schema a circular dependency is created
        // shipment_items_received has two parents
        // Guid is useful to specify that it is the same entity appearing in multiple places in the mutation
        const orma_schema: orma_schema = {
            variants: {
                id: { primary_key: true, not_null: true },
                resource_id: { not_null: true },
                $indexes: [
                    {
                        index_name: 'unique',
                        fields: ['resource_id'],
                        is_unique: true,
                    },
                ],
            },
            shipment_items: {
                id: { primary_key: true, not_null: true },
                variant_id: { references: { variants: { id: {} } } },
                resource_id: { not_null: true },
                $indexes: [
                    {
                        index_name: 'unique',
                        fields: ['resource_id'],
                        is_unique: true,
                    },
                ],
            },
            inventory_adjustments: {
                id: { primary_key: true, not_null: true },
                resource_id: { not_null: true },
                $indexes: [
                    {
                        index_name: 'unique',
                        fields: ['resource_id'],
                        is_unique: true,
                    },
                ],
            },
            shipment_items_received: {
                id: { primary_key: true, not_null: true },
                inventory_adjustment_id: {
                    references: { inventory_adjustments: { id: {} } },
                },
                shipment_item_id: {
                    references: { shipment_items: { id: {} } },
                },
                resource_id: { not_null: true },
                $indexes: [
                    {
                        index_name: 'unique',
                        fields: ['resource_id'],
                        is_unique: true,
                    },
                ],
            },
        }

        let query_results = [
            [{ id: 11, resource_id: 11 }],
            [{ id: 22, resource_id: 22 }],
        ]
        const mutation = {
            $operation: 'create',
            variants: [
                {
                    resource_id: 1,
                    inventory_adjustments: [
                        { id: { $guid: 11 }, resource_id: 11 },
                    ],
                    shipment_items: [
                        {
                            resource_id: 22,
                            shipment_items_received: [
                                {
                                    inventory_adjustment_id: { $guid: 11 },
                                    resource_id: 333,
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        const results = await orma_mutate(
            mutation,
            async statements => query_results,
            orma_schema
        )
        debugger
    })
})
