import { expect } from 'chai'
import { describe, test } from 'mocha'
import { orma_schema } from '../introspector/introspector'
import {
    orma_nester,
    orma_query
} from './query'


describe('query', () => {
    const orma_schema: orma_schema = {
        products: {
            id: {},
            vendor_id: {
                references: {
                    vendors: {
                        id: {}
                    }
                }
            }
        },
        vendors: {
            id: {}
        },
        images: {
            id: {},
            product_id: {
                references: {
                    products: {
                        id: {}
                    }
                }
            }
        },
        image_urls: {
            image_id: {
                references: {
                    images: {
                        id: {}
                    }
                }
            }
        }
    }

    describe(orma_nester.name, () => {
        test('nests restults', () => {
            const result = orma_nester(
                [
                    [['products'], [{ vendor_id: 1 }]],
                    [['products', 'vendors'], [{ id: 1 }]]
                ],
                orma_schema
            )

            expect(result).to.deep.equal({
                products: [
                    {
                        vendor_id: 1,
                        vendors: [
                            {
                                id: 1
                            }
                        ]
                    }
                ]
            })
        })
    })
    describe.skip('dev', () => {
        test('dev', async () => {
            const query = {
                calls: {
                    resource_id: true,
                    call_has_units: {
                        id: true
                    }
                }
            }
            const orma_schema = {
                call_has_units: {
                    $comment: '',
                    call_id: {
                        data_type: 'number',
                        required: true,
                        indexed: true,
                        character_count: 10,
                        references: { calls: { id: {} } }
                    },
                    created_at: { data_type: 'date', required: true, default: 'CURRENT_TIMESTAMP' },
                    id: {
                        data_type: 'number',
                        required: true,
                        indexed: true,
                        unique: true,
                        primary_key: true,
                        character_count: 10
                    },
                    resource_id: {
                        data_type: 'string',
                        required: true,
                        indexed: true,
                        unique: true,
                        character_count: 20
                    },
                    unit_id: {
                        data_type: 'number',
                        required: true,
                        indexed: true,
                        character_count: 10,
                        references: { units: { id: {} } }
                    },
                    updated_at: { data_type: 'date', required: true, default: 'CURRENT_TIMESTAMP' }
                },
                calls: {
                    $comment: '',
                    address: { data_type: 'string', character_count: 250 },
                    age: { data_type: 'number', character_count: 10, default: '0' },
                    bus_arrived_at: { data_type: 'date' },
                    bus_number: { data_type: 'number', character_count: 10 },
                    complaint: { data_type: 'string', character_count: 2000 },
                    cpr_started: { data_type: 'boolean', character_count: 3 },
                    created_at: { data_type: 'date', required: true, default: 'CURRENT_TIMESTAMP' },
                    first_name: { data_type: 'string', character_count: 100 },
                    gender: { data_type: 'string', character_count: 10 },
                    id: {
                        data_type: 'number',
                        required: true,
                        indexed: true,
                        unique: true,
                        primary_key: true,
                        character_count: 10
                    },
                    last_name: { data_type: 'string', character_count: 100 },
                    resource_id: {
                        data_type: 'string',
                        required: true,
                        indexed: true,
                        unique: true,
                        character_count: 45
                    },
                    responsiveness: { data_type: 'string', character_count: 45 },
                    summary: { data_type: 'string', character_count: 2000 },
                    ten_nine: { data_type: 'string', character_count: 45 },
                    updated_at: { data_type: 'date', required: true, default: 'CURRENT_TIMESTAMP' }
                },
                units: {
                    $comment: '',
                    created_at: { data_type: 'date', required: true, default: 'CURRENT_TIMESTAMP' },
                    first_name: { data_type: 'string', character_count: 100 },
                    id: {
                        data_type: 'number',
                        required: true,
                        indexed: true,
                        unique: true,
                        primary_key: true,
                        character_count: 10
                    },
                    last_name: { data_type: 'string', character_count: 100 },
                    phone: { data_type: 'string', character_count: 50 },
                    resource_id: {
                        data_type: 'string',
                        required: true,
                        indexed: true,
                        unique: true,
                        character_count: 45
                    },
                    updated_at: { data_type: 'date', required: true, default: 'CURRENT_TIMESTAMP' }
                }
            }

            var actual_query = ''
            const test = await orma_query(query, orma_schema, sql_strings => {
                actual_query = sql_strings[0]
                return Promise.resolve([])
            })
            expect(actual_query).to.deep.equal('SELECT id FROM calls')
        })
    })
})

/*
THOUGHTS:
what if nothing selected?
what if nothing selected on the root (error?)


// 1. verbose, separates $path into its own key
{
    $any: {
        $eq: {
            $path: [['variants', 'images'], {
                $gt: [1, 2]
            }],
        }
    }
}

SELECT * FROM products WHERE (
    created_at > ANY (
        SELECT created_at FROM variants WHERE product_id = product.id
    )
)

// 2. cant change = or <= behaviour, no separation of $path (what can $path even do on its own? it needs a keyword like 'any', 'in' or 'all')
{
    $any: [['variants', 'images'], {
        $eq: ['id', 3]
    }]
}

// 3. not convention to have $eq as a parameter - usually function names are keys...
{
    $any: [['variants', 'images'], {
        $eq: ['id', 3]
    }, '$eq']
}

// 4. not right either. $eq needs 2 params, since we are setting something is equal to something else.
{
    $eq: {
        $any: [['variants', 'images'], {
            $eq: ['id', 3]
        }]
    }
}

{

}

{
    $eq: ['id', {
        $any: {
            $select: ['product_id'],
            $from: 'variants'
            $where: {
                $eq: ['id', {
                    $any: {
                        $select: ['variant_id']
                        $from: 'images'
                        $where: ...
                    }
                }]
            }
        }
    }]
}

{
    $any: ['id', {
        $select: ['product_id', 'id'],
        $where: {

        }
    }]
}

SELECT column_name(s)
FROM table_name
WHERE column_name operator ANY
  (SELECT column_name
  FROM table_name
  WHERE condition);




operator is one of =, !=, <=, >=...

*/
