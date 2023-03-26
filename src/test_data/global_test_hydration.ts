import { GlobalTestMutation } from './global_test_schema'

export const global_test_hydration = {
    $operation: 'create',
    users: [
        {
            id: 1,
            first_name: 'Alice',
            last_name: 'Anderson',
            email: 'aa@a.com',
            billing_address_id: 1,
            shipping_address_id: 2,
        },
        {
            id: 2,
            first_name: 'Bob',
            email: 'bob@bob.com',
            billing_address_id: 3,
        },
        {
            id: 3,
            first_name: 'Charlie',
            last_name: 'Coal',
            email: 'char@coal.com',
        },
    ],
    posts: [
        {
            id: 1,
            user_id: 1,
            title: 'First post!',
            views: 2,
        },
        {
            id: 2,
            user_id: 1,
            title: 'Post #2',
            views: 15,
        },
        {
            id: 3,
            user_id: 3,
            title: 'How to light a wood stove',
        },
    ],
    comments: [
        {
            id: 1,
            post_id: 1,
        },
        {
            id: 2,
            post_id: 3,
        },
    ],
    addresses: [
        {
            id: 1,
            line_1: '1 Road st',
            resource_id: '1',
        },
    ],
} as const satisfies GlobalTestMutation
