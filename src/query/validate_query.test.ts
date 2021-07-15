import {describe, test, expect} from 'mocha'
import { orma_schema } from '../introspector/introspector'
import { validator } from './validate_query'


const schema: orma_schema = {
    grand_parent: {
        id: {},
        name: {},
    },
    parent: {
        id: {},
        grand_parent_id: {
            references: {
                grand_parent: {
                    id: {}
                }
            }
        },
        name: { }
    },
    child: {
        id: {},
        parent_id: {
            references: {
                parent: {
                    id: {}
                }
            }
        },
        child_name: { }
    }
}

/*

{
    qty: {
        $sum: 'quantity'
    },
    inventory_adjustments: {
        variants: {
            sku: true
        }
    },
    inventory_adjustments: {
        quantity: true
    }
}

*/

describe.skip('validate_query.ts', () => {
    describe('field resolvers', () => {
        test('Allows valid keys', () => {
            const data = {
                grand_parent: {
                    id: true,
                    grand_parent_column1: true,
                    parent: {
                        parent_column1: true,
                        child: {
                            id: true,
                            child_column1: true
                        }
                    }
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(0)
        })
        test('Rejects invalid types as the column resolver', () => {
            const data = {
                parent: {
                    id: [],
                    my_name: 'name'
                }
            }
            
            // 2 errors
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(2)
        })
        test('Rejects field with invalid source', () => {
            const data = {
                parent: {
                    hi: {
                       $field: 'bye'
                    },
                    subq: {
                        id: true
                    },
                    hi2: true
                }
            }
            
            // 3 errors
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(3)
        })
        test('Allows function resolvers', () => {
            const data = {
                parent: {
                    hi: {
                        $field: 'id'
                    }
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(0)
        })
        test('Respects from clause', () => {
            const data = {
                parent: {
                    hi: {
                        $from: 'parent',
                        id: true
                    }
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(0)
        })
        test('Does subqueries', () => {
            const data = {
                parent: {
                    child: {
                        id: true
                    }
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(0)
        })
        test('Does backwards nesting subqueries', () => {
            const data = {
                child: {
                    parent: {
                        id: true
                    }
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(0)
        })
    })
    describe('Where/having clauses', () => {
        test('Requires $eq to have valid field name', () => {
            const data = {
                parent: {
                    $where: {
                        $eq: ['my_id', 5]
                    },
                    my_id: {
                        $field: 'id'
                    }
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(1)
        })
        test('Lets $having have aliased fields', () => {
            const data = {
                parent: {
                    $having: {
                        $eq: ['my_id', 5]
                    },
                    my_id: {
                        $field: 'id'
                    }
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(0)
        })
        test('Lets operators have functions', () => {
            const data = {
                parent: {
                    $where: {
                        $eq: ['name', { $field: 'id' }]
                    },
                    id: 'id'
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(0)
        })
        test('Lets operators have functions', () => {
            const data = {
                parent: {
                    $where: {
                        $lte: ['name', { $field: 'id' }]
                    },
                    id: 'id'
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(0)
        })
        test('Lets $and', () => {
            const data = {
                parent: {
                    $where: {
                        $and: [{
                            $eq: ['id', '5']
                        }]
                    },
                    id: 'id'
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(0)
        })
        test('Changes scope for subqueries', () => {
            const data = {
                parent: {
                    $where: {
                        $in: ['id', {
                            $select: ['parent_id'],
                            $from: 'child',
                            $where: {
                                $eq: ['name', 3] // invalid because 'name' is a field of parent, not child
                            }
                        }]
                    },
                    id: 'id'
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(1)
        })
        test('Requires subqueries to have valid fields', () => {
            const data = {
                parent: {
                    $where: {
                        $in: ['id', {
                            $select: ['invalid_field'],
                            $from: 'child',
                        }]
                    },
                    id: 'id'
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(1)
        })
        test('Requires subqueries to have valid fields', () => {
            const data = {
                parent: {
                    $where: {
                        $in: ['id', {
                            $select: ['name'],
                            $from: 'fake_table',
                        }]
                    },
                    id: 'id'
                }
            }
            
            const {errors} = validator(data, schema)
    
            expect(errors.length).to.equal(1)
        })
    })
    test('', () => {

    })
})