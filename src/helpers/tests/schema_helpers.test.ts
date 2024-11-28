import { expect } from 'chai'
import { describe, test } from 'mocha'
import { orma_query } from '../../query/query'
import { OrmaSchema } from '../../schema/schema_types'
import {
    Edge,
    get_all_edges,
    get_child_edges,
    get_table_names,
    get_column_names,
    get_parent_edges
} from '../schema_helpers'

const orma_schema: OrmaSchema = {
    tables: {
        vendors: {
            columns: {
                id: { data_type: 'int' },
                title: { data_type: 'varchar' }
            },
            primary_key: {
                columns: ['id']
            },
            database_type: 'mysql'
        },
        products: {
            columns: {
                id: { data_type: 'int' },
                vendor_id: { data_type: 'int', not_null: true }
            },
            database_type: 'mysql',
            primary_key: {
                columns: ['id']
            },
            foreign_keys: [
                {
                    columns: ['vendor_id'],
                    referenced_table: 'vendors',
                    referenced_columns: ['id']
                }
            ]
        },
        images: {
            database_type: 'mysql',
            columns: {
                id: { data_type: 'int' },
                product_id: { data_type: 'int' }
            },
            primary_key: {
                columns: ['id']
            },
            foreign_keys: [
                {
                    columns: ['product_id'],
                    referenced_table: 'products',
                    referenced_columns: ['id']
                }
            ]
        }
    },
    cache: {
        foreign_keys_by_parent: {
            vendors: [
                {
                    table: 'products',
                    columns: ['vendor_id'],
                    referenced_table: 'vendors',
                    referenced_columns: ['id']
                }
            ],
            products: [
                {
                    table: 'images',
                    columns: ['product_id'],
                    referenced_table: 'products',
                    referenced_columns: ['id']
                }
            ]
        }
    }
}

describe('schema_helpers.ts', () => {
    describe(get_table_names.name, () => {
        test('gets table names', () => {
            const table_names = get_table_names(orma_schema)
            expect(table_names.sort()).to.deep.equal(
                ['vendors', 'products', 'images'].sort()
            )
        })
    })
    describe(get_column_names.name, () => {
        test('gets column names', () => {
            const column_names = get_column_names('products', orma_schema)
            expect(column_names.sort()).to.deep.equal(
                ['id', 'vendor_id'].sort()
            )
        })
    })
    describe('get_parent_edges', () => {
        test('gets parent edges', () => {
            const parent_edges = get_parent_edges('products', orma_schema)
            const goal: Edge[] = [
                {
                    from_table: 'products',
                    from_columns: 'vendor_id',
                    to_table: 'vendors',
                    to_columns: 'id'
                }
            ]
            expect(parent_edges.sort()).to.deep.equal(goal.sort())
        })
    })
    describe('get_child_edges', () => {
        test('gets child edges', () => {
            const parent_edges = get_child_edges('vendors', orma_schema)
            const goal: Edge[] = [
                {
                    from_table: 'vendors',
                    from_columns: 'id',
                    to_table: 'products',
                    to_columns: 'vendor_id'
                }
            ]
            expect(parent_edges.sort()).to.deep.equal(goal.sort())
        })
    })
    describe('get_all_edges', () => {
        test('gets all edges', () => {
            const all_edges = get_all_edges('products', orma_schema)
            const goal: Edge[] = [
                {
                    from_table: 'products',
                    from_columns: 'vendor_id',
                    to_table: 'vendors',
                    to_columns: 'id'
                },
                {
                    from_table: 'products',
                    from_columns: 'id',
                    to_table: 'images',
                    to_columns: 'product_id'
                }
            ]
            expect(all_edges.sort()).to.deep.equal(goal.sort())
        })
    })
})
