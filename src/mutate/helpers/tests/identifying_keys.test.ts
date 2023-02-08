import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../../schema/introspector'
import {
    get_identifying_keys,
    get_possible_identifying_keys,
} from '../identifying_keys'

describe('identifying_keys.ts', () => {
    const schema: OrmaSchema = {
        $entities: {
            product_has_images: {
                $fields: {
                    product_id: { not_null: true },
                    image_id: { not_null: true },
                },
                $database_type: 'mysql',
                $indexes: [
                    { fields: ['product_id', 'image_id'], is_unique: true },
                ],
            },
            products: {
                $fields: { id: { primary_key: true }, title: {} },
                $database_type: 'mysql',
                $indexes: [{ fields: ['title'], is_unique: true }],
            },
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
        test('will not use fields that have null as their value', () => {
            const record = {
                title: null,
            }

            const values_by_guid = {}

            const keys = get_identifying_keys(
                'products',
                record,
                values_by_guid,
                schema
            )

            expect(keys).to.deep.equal([])
        })
        test('allows nullable unique fields, as long as the record value is not null', () => {
            const record = {
                title: 'test',
            }

            const values_by_guid = {}

            const keys = get_identifying_keys(
                'products',
                record,
                values_by_guid,
                schema
            )

            expect(keys).to.deep.equal(['title'])
        })
        test('ignores guid fields', () => {
            const record = {
                id: { $guid: '1234' },
                title: 'test',
            }

            const values_by_guid = {}

            const keys = get_identifying_keys(
                'products',
                record,
                values_by_guid,
                schema
            )

            expect(keys).to.deep.equal(['title'])
        })
    })
    describe(get_possible_identifying_keys.name, () => {
        test('includes nullable unique keys', () => {
            const result = get_possible_identifying_keys('products', schema)
            expect(result).to.deep.equal([['id'], ['title']])
        })
    })
})
