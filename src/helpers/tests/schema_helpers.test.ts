import { expect } from 'chai'
import { describe, test } from 'mocha'
import { OrmaSchema } from '../../introspector/introspector'
import {
    Edge,
    get_all_edges,
    get_child_edges,
    get_entity_names,
    get_field_names,
    get_parent_edges,
} from '../schema_helpers'

describe('schema_helpers', () => {
    describe('get_entity_names', () => {
        test('gets entity names', () => {
            const orma_schema: OrmaSchema = {
                vendors: {
                    $database_type: 'mysql',
                },
                products: {
                    $database_type: 'mysql',
                },
            }

            const entity_names = get_entity_names(orma_schema)
            expect(entity_names.sort()).to.deep.equal(
                ['vendors', 'products'].sort()
            )
        })
    })
    describe('get_field_names', () => {
        test('gets field names', () => {
            const orma_schema: OrmaSchema = {
                vendors: {
                    $database_type: 'mysql',
                },
                products: {
                    $database_type: 'mysql',
                    id: {},
                    title: {},
                },
            }

            const field_names = get_field_names('products', orma_schema)
            expect(field_names.sort()).to.deep.equal(['id', 'title'].sort())
        })
    })
    describe('get_parent_edges', () => {
        test('gets parent edges', () => {
            const orma_schema: OrmaSchema = {
                vendors: {
                    $database_type: 'mysql',
                    id: {},
                },
                products: {
                    $database_type: 'mysql',
                    id: {},
                    vendor_id: {
                        references: {
                            vendors: {
                                id: {},
                            },
                        },
                    },
                },
            }

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
            const orma_schema: OrmaSchema = {
                vendors: {
                    $database_type: 'mysql',
                    id: {},
                },
                products: {
                    $database_type: 'mysql',
                    id: {},
                    vendor_id: {
                        references: {
                            vendors: {
                                id: {},
                            },
                        },
                    },
                },
            }

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
            const orma_schema: OrmaSchema = {
                vendors: {
                    $database_type: 'mysql',
                    id: {},
                },
                products: {
                    $database_type: 'mysql',
                    id: {},
                    vendor_id: {
                        references: {
                            vendors: {
                                id: {},
                            },
                        },
                    },
                },
                images: {
                    $database_type: 'mysql',
                    product_id: {
                        references: {
                            products: {
                                id: {},
                            },
                        },
                    },
                },
            }

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
