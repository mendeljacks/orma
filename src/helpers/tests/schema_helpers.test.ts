import { expect } from 'chai'
import { describe, test } from 'mocha'
import { orma_query } from '../../query/query'
import { OrmaSchema } from '../../types/schema/schema_types'
import {
    Edge,
    get_all_edges,
    get_child_edges,
    get_entity_names,
    get_field_names,
    get_parent_edges,
} from '../schema_helpers'

const orma_schema: OrmaSchema = {
    $entities: {
        vendors: {
            $fields: {
                id: { $data_type: 'int' },
                title: { $data_type: 'varchar' },
            },
            $primary_key: {
                $fields: ['id'],
            },
            $database_type: 'mysql',
        },
        products: {
            $fields: {
                id: { $data_type: 'int' },
                vendor_id: { $data_type: 'int', $not_null: true },
            },
            $database_type: 'mysql',
            $primary_key: {
                $fields: ['id'],
            },
            $foreign_keys: [
                {
                    $fields: ['vendor_id'],
                    $references: {
                        $entity: 'vendors',
                        $fields: ['id'],
                    },
                },
            ],
        },
        images: {
            $database_type: 'mysql',
            $fields: {
                id: { $data_type: 'int' },
                product_id: { $data_type: 'int' },
            },
            $primary_key: {
                $fields: ['id'],
            },
            $foreign_keys: [
                {
                    $fields: ['product_id'],
                    $references: {
                        $entity: 'products',
                        $fields: ['id'],
                    },
                },
            ],
        },
    },
    $cache: {
        $reversed_foreign_keys: {
            vendors: [
                {
                    from_field: 'id',
                    to_entity: 'products',
                    to_field: 'vendor_id',
                },
            ],
            products: [
                {
                    from_field: 'id',
                    to_entity: 'images',
                    to_field: 'product_id',
                },
            ],
        },
    },
}

describe('schema_helpers.ts', () => {
    describe(get_entity_names.name, () => {
        test('gets entity names', () => {
            const entity_names = get_entity_names(orma_schema)
            expect(entity_names.sort()).to.deep.equal(
                ['vendors', 'products', 'images'].sort()
            )
        })
    })
    describe(get_field_names.name, () => {
        test('gets field names', () => {
            const field_names = get_field_names('products', orma_schema)
            expect(field_names.sort()).to.deep.equal(['id', 'vendor_id'].sort())
        })
    })
    describe('get_parent_edges', () => {
        test('gets parent edges', () => {
            const parent_edges = get_parent_edges('products', orma_schema)
            const goal: Edge[] = [
                {
                    from_entity: 'products',
                    from_field: 'vendor_id',
                    to_entity: 'vendors',
                    to_field: 'id',
                },
            ]
            expect(parent_edges.sort()).to.deep.equal(goal.sort())
        })
    })
    describe('get_child_edges', () => {
        test('gets child edges', () => {
            const parent_edges = get_child_edges('vendors', orma_schema)
            const goal: Edge[] = [
                {
                    from_entity: 'vendors',
                    from_field: 'id',
                    to_entity: 'products',
                    to_field: 'vendor_id',
                },
            ]
            expect(parent_edges.sort()).to.deep.equal(goal.sort())
        })
    })
    describe('get_all_edges', () => {
        test('gets all edges', () => {
            const all_edges = get_all_edges('products', orma_schema)
            const goal: Edge[] = [
                {
                    from_entity: 'products',
                    from_field: 'vendor_id',
                    to_entity: 'vendors',
                    to_field: 'id',
                },
                {
                    from_entity: 'products',
                    from_field: 'id',
                    to_entity: 'images',
                    to_field: 'product_id',
                },
            ]
            expect(all_edges.sort()).to.deep.equal(goal.sort())
        })
    })
})
