import { expect } from 'chai'
import { describe, test } from 'mocha'
import { orma_schema } from '../introspector/introspector'
import { get_entity_names, get_field_names } from './schema_helpers'


describe('schema_helpers', () => {
    describe('get_entity_names', () => {
        test('gets entity names', () => {
            const orma_schema: orma_schema = {
                entities: {
                    vendors: {
                        fields: {}
                    },
                    products: {
                        fields: {}
                    }
                }
            }

            const entity_names = get_entity_names(orma_schema)
            expect(entity_names.sort()).to.deep.equal(['vendors', 'products'].sort())
        })
    })
    describe('get_parent_edges', () => {
        test('gets parent edges', () => {
            const orma_schema: orma_schema = {
                entities: {
                    vendors: {
                        fields: {
                            id: {}
                        }
                    },
                    products: {
                        fields: {
                            id: {},
                            vendor_id: {
                                references: {
                                    vendors: {
                                        id: 'a'
                                    }
                                }
                            }
                        }
                    }
                }
            }

            const field_names = get_field_names('products', orma_schema)
            expect(field_names.sort()).to.deep.equal(['id', 'title'].sort())
        })
    })
})