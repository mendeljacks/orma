import { describe, test } from 'mocha'
import { expect } from 'chai'
import { add_foreign_key_indexes } from '../add_foreign_key_indexes'
import { orma_test_schema } from '../../mutate.test'

import { apply_guid_macro } from '../../macros/guid_macro'
import { clone } from '../../../helpers/helpers'
import { orma_schema } from '../../../introspector/introspector'

const test_statements = [
    {
        paths: [
            ['parents', 0],
            ['parents', 1],
        ],
        route: ['parents'],
    },
]

describe('Foreign Key Propagation', () => {
    describe(add_foreign_key_indexes.name, () => {
        test.only('Propagates guids', () => {
            const test_statements = [
                {
                    paths: [['variants', 0, 'inventory_adjustments', 0]],
                    route: ['variants', 'inventory_adjustments'],
                },
                {
                    paths: [['variants', 0, 'shipment_items', 0]],
                    route: ['variants', 'shipment_items'],
                },
            ]

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

            const { guid_map } = apply_guid_macro(mutation)
            const result = add_foreign_key_indexes(
                test_statements,
                query_results,
                mutation,
                orma_schema
            )
            const expected_result = []
            expect(result).to.deep.equal(expected_result)
            const result2 = add_foreign_key_indexes(
                test_statements,
                query_results,
                mutation,
                orma_schema
            )
        })
        test('works with multiple identifying keys', () => {
            const query_results = [
                [
                    {
                        // unique key
                        unique1: 1,
                        grandparent_id: 11,
                    },
                    {
                        // simple primary key
                        id: 3,
                        grandparent_id: 13,
                    },
                ],
            ]

            // note that the order of the mutation is not the same as the query results order (this is to make
            // sure the function is being tested properly)
            const mutation = {
                parents: [{ id: 3 }, { unique1: 1 }],
            }

            const result = add_foreign_key_indexes(
                test_statements,
                query_results,
                mutation,
                orma_test_schema
            )

            expect(result).to.deep.equal({
                '["parents",0]': {
                    id: 3,
                    grandparent_id: 13,
                },
                '["parents",1]': {
                    unique1: 1,
                    grandparent_id: 11,
                },
            })
        })
        test('works with multiple statements', () => {
            const statements = [
                {
                    paths: [['parents', 0]],
                    route: ['parents'],
                },
                {
                    paths: [['parents', 0, 'children', 0]],
                    route: ['parents', 'children'],
                },
            ]

            const query_results = [
                [
                    {
                        id: 1,
                        grandparent_id: 11,
                    },
                ],
                [{ id1: 1, id2: 2, parent_id: 12 }],
            ]

            const mutation = {
                parents: [
                    {
                        id: 1,
                        children: [
                            {
                                // composite primary key
                                id1: 1,
                                id2: 2,
                            },
                        ],
                    },
                ],
            }

            const result = add_foreign_key_indexes(
                statements,
                query_results,
                mutation,
                orma_test_schema
            )

            expect(result).to.deep.equal({
                '["parents",0]': {
                    id: 1,
                    grandparent_id: 11,
                },
                '["parents",0,"children",0]': { id1: 1, id2: 2, parent_id: 12 },
            })
        })
        test('works with duplicate keys', () => {
            // this situation could happen e.g. if there are rows in different locations in the mutation

            const query_results = [
                [
                    {
                        id: 1,
                        grandparent_id: 11,
                    },
                ],
            ]

            const mutation = {
                parents: [
                    { id: 1 },
                    {
                        id: 1,
                    },
                ],
            }

            const result = add_foreign_key_indexes(
                test_statements,
                query_results,
                mutation,
                orma_test_schema
            )

            // it should add foreign keys to both locations, even though they have the same id and there is only
            // on record returned from the database
            expect(result).to.deep.equal({
                '["parents",0]': {
                    id: 1,
                    grandparent_id: 11,
                },
                '["parents",1]': {
                    id: 1,
                    grandparent_id: 11,
                },
            })
        })
    })
})
