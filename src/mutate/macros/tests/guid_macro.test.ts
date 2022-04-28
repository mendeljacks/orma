import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../../../helpers/helpers'
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
})
