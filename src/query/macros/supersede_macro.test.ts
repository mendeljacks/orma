import { describe, test } from 'mocha'
import { apply_supersede_macro } from './supersede_macro'
import { expect } from 'chai'
import { OrmaSchema } from '../../introspector/introspector'
import { clone } from '../../helpers/helpers'
import { OrmaMutation } from '../../types/mutation/mutation_types'

const orma_schema: OrmaSchema = {
    users: {
        $database_type: 'mysql',
        id: { primary_key: true },
    },
    user_has_photos: {
        $database_type: 'mysql',
        id: { primary_key: true },
        url: {},
        user_id: {
            references: {
                users: {
                    id: {},
                },
            },
        },
        $indexes: [
            {
                index_name: 'primary',
                fields: ['id'],
                is_unique: true,
            },
            {
                index_name: 'uniq',
                fields: ['url'],
                is_unique: true,
            },
        ],
    },
    user_has_posts: {
        $database_type: 'mysql',
        id: { primary_key: true },
        text: {},
        user_id: {
            references: {
                users: {
                    id: {},
                },
            },
        },
        $indexes: [
            {
                index_name: 'uniq',
                fields: ['text', 'user_id'],
                is_unique: true,
            },
        ],
    },
} as const

describe('supersede_macro', () => {
    test('handles supersedes', async () => {
        // @ts-ignore
        const mutation = {
            $operation: 'update',
            users: [
                {
                    id: 1,
                    $supersede: ['user_has_photos', 'user_has_posts'],
                    user_has_photos: [{ url: 'https://pic.jpg' }],
                    user_has_posts: [{ text: 'hi' }, { text: 'there' }],
                },
            ],
        } as OrmaMutation<typeof orma_schema>

        const goal = {
            $operation: 'update',
            users: [
                {
                    id: 1,
                    user_has_photos: [
                        { $operation: 'delete', id: 1 },
                        { $operation: 'create', url: 'https://pic.jpg' },
                    ],
                    user_has_posts: [
                        { $operation: 'delete', id: 1 },
                        { $operation: 'create', text: 'hi' },
                        { $operation: 'create', text: 'there' },
                    ],
                },
            ],
        }

        const orma_query = async query => {
            return {
                user_has_photos: [{ id: 1 }],
                user_has_posts: [{ id: 1 }],
            }
        }

        await apply_supersede_macro(mutation, orma_query, orma_schema).catch(
            err => {
                debugger
            }
        )

        expect(mutation).to.deep.equal(goal)
    })

    // Todo: tests
    // reverse nesting
    // unique column finding
    // multiple and single supersede
    // only deletes connected
    // updates when exists
    // respect from clause
    // allow providing any unique instead of primary key
    // allow delete where connected by guid
})
