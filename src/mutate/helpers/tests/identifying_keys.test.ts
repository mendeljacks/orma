import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../../introspector/introspector'
import { get_identifying_keys } from '../identifying_keys'

describe('identifying_keys.ts', () => {
    const schema: OrmaSchema = {
        product_has_images: {
            product_id: {
                not_null: true,
            },
            image_id: {
                not_null: true,
            },
            $indexes: [
                {
                    fields: ['product_id', 'image_id'],
                    is_unique: true,
                },
            ],
        },
    }

    describe(get_identifying_keys.name, () => {
        test('uses resolved $guid fields as identifying keys', () => {
            const record = {
                product_id: { $guid: 1 },
                image_id: { $guid: 2 },
            }

            const values_by_guid = {
                1: 11,
                2: 22,
            }

            const keys = get_identifying_keys(
                'product_has_images',
                record,
                values_by_guid,
                schema
            )

            expect(keys).to.deep.equal(['product_id', 'image_id'])
        })
    })
})
