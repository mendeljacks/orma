import { describe, test } from 'mocha'
import { as_orma_schema } from '../query'
import { apply_where_connected_macro } from './where_connected_macro'

describe('where_connected_macro.ts', () => {
    const schema = as_orma_schema({
        grandparents: {
            id: {
                not_null: true,
                primary_key: true,
            },
        },
        parents: {
            id: {
                not_null: true,
                primary_key: true,
            },
            grandparent_id: {
                references: {
                    grandparents: {
                        id: {},
                    },
                },
            },
        },
        children: {
            id: {
                not_null: true,
                primary_key: true,
            },
            parent_id: {
                references: {
                    parents: {
                        id: {},
                    },
                },
            },
        },
    })

    describe(apply_where_connected_macro.name, () => {
        test('handles nested entities', () => {
            const query = {
                $where_connected: {
                    grandparents: {
                        id: [1, 2]
                    }
                },
                children: {
                    id: true
                }
            }

            apply_where_connected_macro(query)
        })
    })
})
