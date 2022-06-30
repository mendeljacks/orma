import { expect } from 'chai'
import { describe, test } from 'mocha'
import { get_ownership_query, mutation_ownership_check } from './mutation_ownership_check'


describe('mutation_ownership_check', () => {
    describe(mutation_ownership_check.name, () => {
        test('integration test', async () => {
            const query_function = async () => ({
                vendors: [{
                    id: 2
                }, {
                    id: 5
                }]
            })

            const mutation = {
                products: [{
                    meta: { operation: 'create' },
                    vendor_id: 1
                }]
            }

            const error = await mutation_ownership_check(mutation, 'vendors', 'id', [1, 2, 3], {}, query_function, {})
            expect(error).to.not.equal(undefined)
        })
        test('works when nothing is connected to ownership entity', async () => {
            const query_function = async () => { }

            const mutation = {}

            const error = await mutation_ownership_check(mutation, 'vendors', 'id', [1, 2, 3], {}, query_function, {})
            expect(error).to.equal(undefined)
        })
        test('works when no ownership entity is returned from query', async () => {
            const query_function = async () => { }

            const mutation = {
                products: [{
                    meta: { operation: 'create' },
                    vendor_id: 1
                }]
            }

            const error = await mutation_ownership_check(mutation, 'vendors', 'id', [1, 2, 3], {}, query_function, {})
            expect(error).to.equal(undefined)
        })
    })
    describe(get_ownership_query.name, () => {
        test('tracks primary keys', () => {
            const mutation = {
                variants: [{
                    meta: { operation: 'update' },
                    id: 12,
                    sku: 'hi'
                }]
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', {})

            expect(ownership_query).to.deep.equal({
                vendors: {
                    where: {
                        any: ['products.variants', {
                            in: ['id', [12]]
                        }]
                    }
                }
            })
        })
        test('tracks descendant foreign keys', () => {
            const mutation = {
                images: [{
                    meta: { operation: 'update' },
                    id: 1,
                    variant_id: 12,
                    bucket_url: 'test.com'
                }, {
                    meta: { operation: 'create' },
                    variant_id: 13,
                    bucket_url: 'test.com'
                }]
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', {})

            expect(ownership_query).to.deep.equal({
                vendors: {
                    where: {
                        or: [{
                            any: ['products.variants', {
                                in: ['id', [12, 13]]
                            }]
                        }, {
                            any: ['products.variants.images', {
                                in: ['id', [1]]
                            }]
                        }]
                    }
                }
            })
        })
        test('tracks direct child foreign keys', () => {
            const mutation = {
                products: [{
                    meta: { operation: 'delete' },
                    id: 1,
                    vendor_id: 12,
                    title: 'hi'
                }, {
                    meta: { operation: 'create' },
                    vendor_id: 13,
                    title: 'hi'
                }]
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', {})

            expect(ownership_query).to.deep.equal({
                vendors: {
                    where: {
                        or: [{
                            in: ['id', [12, 13]]
                        }, {
                            any: ['products', {
                                in: ['id', [1]]
                            }]
                        }]
                    }
                }
            })
        })
        test('tracks multiple entities', () => {
            const mutation = {
                products: [{
                    meta: { operation: 'create' },
                    vendor_id: 12,
                    title: 'hi'
                }],
                warehouses: [{
                    meta: { operation: 'update' },
                    id: 1
                }]
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', {})

            expect(ownership_query).to.deep.equal({
                vendors: {
                    where: {
                        or: [{
                            in: ['id', [12]]
                        }, {
                            any: ['warehouses', {
                                in: ['id', [1]]
                            }]
                        }]
                    }
                }
            })
        })
        test('tracks ownership entity updates', () => {
            const mutation = {
                vendors: [{
                    meta: { operation: 'update' },
                    id: 1,
                    name: 'hi'
                }]
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', {})

            expect(ownership_query).to.deep.equal({
                vendors: {
                    where: {
                        in: ['id', [1]]
                    }
                }
            })
        })
        test('ignores ownership entity creates', () => {
            const mutation = {
                vendors: [{
                    meta: { operation: 'create' },
                    id: 12,
                    name: 'hi'
                }]
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', {})
            expect(ownership_query).to.equal(undefined)
        })
        test('throws on no operation provided', () => {
            const mutation = {
                products: [{
                    vendor_id: 12,
                    title: 'hi'
                }]
            }

            try {
                const ownership_query = get_ownership_query(mutation, 'vendors', {})
                expect('should throw an error').to.equal(true)
            } catch (error) { }
        })
        test('ignores diffed fields', () => {
            const mutation = {
                products: [{
                    meta: { operation: 'create' },
                    vendor_id: 12,
                    title: 'hi'
                }, {
                    meta: { operation: 'update' },
                    id: 2,
                    title: 'hi'
                }],
                inventory_adjustments: [{
                    meta: { operation: 'create' },
                    variant_id: 1,
                    shelf_id: 2
                }],
            }

            const ownership_ignores = {
                products: ['vendor_id'],
                inventory_adjustments: ['shelf_id']
            }

            const ownership_query = get_ownership_query(mutation, 'vendors', ownership_ignores)

            expect(ownership_query).to.deep.equal({
                vendors: {
                    where: {
                        any: ['products.variants', {
                            in: ['id', [1]]
                        }]
                    }
                }
            })
        })
    })
})