import { expect } from 'chai'
import { describe, test } from 'mocha'
import { global_test_schema } from '../../../helpers/tests/global_test_schema'
import {
    get_identifying_keys,
    get_possible_identifying_keys,
} from '../identifying_keys'

describe('identifying_keys.ts', () => {
    describe(get_identifying_keys.name, () => {
        test('uses resolved $guid fields as identifying keys', () => {
            const record = {
                user_id: { $guid: 1 },
                post_id: { $guid: 2 },
            }

            const values_by_guid = {
                1: 11,
                2: 22,
            }

            const keys = get_identifying_keys(
                'likes',
                record,
                values_by_guid,
                global_test_schema
            )

            expect(keys).to.deep.equal(['user_id', 'post_id'])
        })
        test('will not use fields that have null as their value', () => {
            const record = {
                title: null,
            }

            const values_by_guid = {}

            const keys = get_identifying_keys(
                'posts',
                record,
                values_by_guid,
                global_test_schema
            )

            expect(keys).to.deep.equal([])
        })
        test('allows nullable unique fields, as long as the record value is not null', () => {
            const record = {
                title: 'test',
            }

            const values_by_guid = {}

            const keys = get_identifying_keys(
                'posts',
                record,
                values_by_guid,
                global_test_schema
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
                'posts',
                record,
                values_by_guid,
                global_test_schema
            )

            expect(keys).to.deep.equal(['title'])
        })
    })
    describe(get_possible_identifying_keys.name, () => {
        test('includes nullable unique keys', () => {
            const result = get_possible_identifying_keys(
                'posts',
                global_test_schema
            )
            expect(result).to.deep.equal([['id'], ['title']])
        })
    })
})
