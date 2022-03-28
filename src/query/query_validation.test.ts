import Ajv from 'ajv/dist/2020'
import { expect } from 'chai'
import { describe, test } from 'mocha'
import { as_orma_schema } from './query'
import { get_any_path_errors, get_query_schema, postprocess_query_for_validation, preprocess_query_for_validation } from './query_validation'

const ajv = new Ajv({ discriminator: true })

describe('query_validation', () => {
    const orma_schema = as_orma_schema({
        products: {
            id: {
                data_type: 'int',
            },
            vendor_id: {
                data_type: 'int',
                references: {
                    vendors: {
                        id: {},
                    },
                },
            },
            name: {
                data_type: 'varchar',
            },
            description: {
                data_type: 'varchar',
            },
            $indexes: [],
        },
        vendors: {
            id: {},
        },
        images: {
            id: {},
            product_id: {
                references: {
                    products: {
                        id: {},
                    },
                },
            },
        },
        image_urls: {
            image_id: {
                references: {
                    images: {
                        id: {},
                    },
                },
            },
        },
    } as const)

    // @ts-ignore
    const validation_schema = get_query_schema(orma_schema)
    const validate = ajv.compile(validation_schema)

    describe(get_query_schema.name, () => {
        test('requires $from', () => {
            validate({
                products: {
                    id: true,
                },
            })

            expect(validate.errors?.length).to.be.greaterThan(0)
        })
        test('requires valid $from', () => {
            validate({
                products: {
                    id: true,
                    $from: 'not_an_entity',
                },
            })

            expect(validate.errors?.length).to.be.greaterThan(0)
        })
        test('requires valid simple field names', () => {
            validate({
                products: {
                    not_a_field: true,
                    $from: 'products',
                },
            })

            expect(validate.errors?.length).to.be.greaterThan(0)
        })
        test('requires valid renamed field names', () => {
            validate({
                products: {
                    id: 'not_a_field',
                    $from: 'products',
                },
            })

            expect(validate.errors?.length).to.be.greaterThan(0)
        })
        test('allows order by', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $order_by: [
                        'name',
                        {
                            $asc: {
                                $sum: 'id',
                            },
                        },
                    ],
                },
            })

            expect(validate.errors).to.equal(null)
        })
        test('requires order by have valid fields', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $order_by: [
                        {
                            $sum: 'not_a_field',
                        },
                    ],
                },
            })

            expect(validate.errors?.length).to.be.greaterThan(0)
        })
        test('allows group by', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $group_by: [
                        {
                            $sum: 'id',
                        },
                    ],
                },
            })

            expect(validate.errors).to.equal(null)
        })
        test('requires group by has valid fields', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $group_by: ['not_a_field'],
                },
            })

            expect(validate.errors?.length).to.be.greaterThan(0)
        })
        test('allows limit and offset', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $limit: 1,
                    $offset: 1,
                },
            })

            expect(validate.errors).to.equal(null)
        })
        test('allows limit and offset', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $limit: 1,
                    $offset: 1,
                },
            })

            expect(validate.errors).to.equal(null)
        })
        test('allows where clause $and', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $where: {
                        $and: [
                            {
                                $eq: ['id', 'id'],
                            },
                        ],
                    },
                },
            })

            expect(validate.errors).to.equal(null)
        })
        test('allows where clause operations', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $where: {
                        $and: [
                            {
                                $eq: ['id', 'id'],
                            },
                            {
                                $gt: ['id', 'id'],
                            },
                            {
                                $lt: ['id', 'id'],
                            },
                            {
                                $gte: ['id', 'id'],
                            },
                            {
                                $lte: ['id', 'id'],
                            },
                            {
                                $like: ['id', 'id'],
                            },
                        ],
                    },
                },
            })

            expect(validate.errors).to.equal(null)
        })
        test('allows where clause $in', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $where: {
                        $in: ['id', [{ $escape: 1 }, { $escape: '2' }]],
                    },
                },
            })

            expect(validate.errors).to.equal(null)
        })
        test('requires operations are escaped', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $where: {
                        $eq: ['id', 1],
                    },
                },
            })

            expect(validate.errors?.length).to.be.greaterThan(0)
        })
        test('allows $any_path', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $where: {
                        // this is required because JSON schema cant directly validate the last element in an array
                        $any_path_last_entity: 'image_urls',
                        $any_path: [['images', 'image_urls'], {
                            $eq: ['image_id', {
                                $escape: 12
                            }]
                        }]
                    },
                },
            })

            expect(validate.errors).to.equal(null)
        })
        test('correctly interprets which entity the $any_path is on', () => {
            validate({
                products: {
                    id: true,
                    $from: 'products',
                    $where: {
                        // this is required because JSON schema cant directly validate the last element in an array
                        $any_path_last_entity: 'image_urls',
                        $any_path: [['images', 'image_urls'], {
                            // vendor_id is on the products, not image_urls, so this is an error
                            $eq: ['vendor_id', {
                                $escape: 12
                            }]
                        }]
                    },
                },
            })

            expect(validate.errors?.length).to.be.greaterThan(0)
        })
    })
    describe(preprocess_query_for_validation.name, () => {
        test('adds $any_path_last_entity prop', () => {
            const query = {
                products: {
                    id: true,
                    $where: {
                        $any_path: [['images', 'image_urls'], {
                            $eq: ['id', 'id']
                        }]
                    }
                }
            } as const

            //@ts-ignore
            preprocess_query_for_validation(query, orma_schema)

            expect(query).to.deep.equal({
                products: {
                    id: true,
                    $where: {
                        $any_path_last_entity: 'image_urls',
                        $any_path: [['images', 'image_urls'], {
                            $eq: ['id', 'id']
                        }]
                    }
                }
            })
        })
    })
    describe(postprocess_query_for_validation.name, () => {
        test('removes $any_path_last_entity prop', () => {
            const query = {
                products: {
                    id: true,
                    $where: {
                        $any_path_last_entity: 'image_urls',
                        $any_path: [['images', 'image_urls'], {
                            $eq: ['id', 'id']
                        }]
                    }
                }
            } as const

            //@ts-ignore
            postprocess_query_for_validation(query, orma_schema)

            expect(query).to.deep.equal({
                products: {
                    id: true,
                    $where: {
                        $any_path: [['images', 'image_urls'], {
                            $eq: ['id', 'id']
                        }]
                    }
                }
            })
        })
    })
    describe(get_any_path_errors.name, () => {
        test('requires first entity to be connected', () => {
            const query = {
                products: {
                    id: true,
                    $where: {
                        $any_path: [['image_urls'], {
                            $eq: ['image_id', 'image_id']
                        }]
                    }
                }
            }

            //@ts-ignore
            const errors = get_any_path_errors(query, orma_schema)

            expect(errors.length).to.equal(1)
        })
        test('requires later entities to be connected', () => {
            const query = {
                products: {
                    id: true,
                    $where: {
                        $any_path: [['images', 'vendors'], {
                            $eq: ['image_id', 'image_id']
                        }]
                    }
                }
            }

            //@ts-ignore
            const errors = get_any_path_errors(query, orma_schema)

            expect(errors.length).to.equal(1)
        })
    })
    // tests:
    // inferred table name
    // random table name
    // 3 cases of fields
    // inferred fields must match from clause
    // can have an object with no inferred keys (so only keys that dont match any field name)
})
