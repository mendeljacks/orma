import { expect } from 'chai'
import { describe, test } from 'mocha'
import { orma_schema } from '../introspector/introspector'
import { validator } from './validate_query'


const schema: orma_schema = {
    grand_parent: {
        id: {},
        grand_parent_column: {},
    },
    parent: {
        id: {},
        parent_column: {},
        grand_parent_id: {
            references: {
                grand_parent: {
                    id: {}
                }
            }
        },
    },
    child: {
        id: {},
        child_column: {},
        parent_id: {
            references: {
                parent: {
                    id: {}
                }
            }
        },
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

describe('validate_query.ts', () => {
    describe('boolean resolver', () => {
        test('validates boolean resolver column names', () => {
            const query = {
                grand_parent: {
                    id: true,
                    grand_parent_column: true,
                    parent: {
                        parent_column: true,
                        child: {
                            id: true,
                            child_column_oops: true
                        }
                    }
                }
            }

            const errors = validator(query, schema)

            expect(errors.length).to.deep.equal(1)
            expect(errors[0].path).to.deep.equal(['grand_parent', 'parent', 'child', 'child_column_oops'])
        })
    })

    describe('virtual columns', () => {
        test('validates $field virtual column', () => {
            const query = {
                parent: {
                    custom_name: { $field: 'parent_column' },
                    custom_name2: { $field: 'oops' }
                }
            }

            const errors = validator(query, schema)


            expect(errors[0].path).to.deep.equal(['parent', 'custom_name2'])
            expect(errors.length).to.deep.equal(1)
        })
    })

    describe('subqueries', () => {
        test('validates the from clause', () => {
            const data = {
                parent: {
                    good: {
                        $from: 'child',
                        id: true
                    },
                    bad: {
                        $from: 'oops',
                        id: true
                    }
                }
            }

            const errors = validator(data, schema)

            const from_clause_errors = errors.filter(err =>
                JSON.stringify(err.path) ===
                JSON.stringify(['parent', 'bad', 'id']))
            expect(from_clause_errors.length).to.equal(1)

        })
        test('validates subquery connections', () => {
            const data = {
                grand_parent: {
                    john: {
                        $from: 'parent',
                        child: {
                            id: true,
                            grand_parent: {
                                id: true
                            }
                        }
                    }
                }
            }

            const errors = validator(data, schema)

            expect(errors.length).to.equal(1)
            expect(errors[0].path).to.deep.equal(['grand_parent', 'john', 'child', 'grand_parent'])
        })

    })

    describe.skip('clauses', () => {
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

            const errors = validator(data, schema)

            expect(errors.length).to.equal(1)
            expect(errors[0].path).to.deep.equal(['parent', '$where'])
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

            const errors = validator(data, schema)

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

            const errors = validator(data, schema)

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

            const errors = validator(data, schema)

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

            const errors = validator(data, schema)

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

            const errors = validator(data, schema)

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

            const errors = validator(data, schema)

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

            const errors = validator(data, schema)

            expect(errors.length).to.equal(1)
        })

    })
})
