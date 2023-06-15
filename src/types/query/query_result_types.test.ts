import {
    GlobalTestAliases,
    GlobalTestQuery,
    GlobalTestSchema,
} from '../../test_data/global_test_schema'
import { IsEqual } from '../helper_types'
import { GetAllEdges } from '../schema/schema_helper_types'
import { OrmaQueryResult } from './query_result_types'

const test = () => {
    const query_response = <Query extends GlobalTestQuery>(
        query: Query
    ): OrmaQueryResult<GlobalTestSchema, Query> => '' as any

    {
        // data props propagate as arrays
        const result = query_response({
            posts: {
                $from: 'posts',
                id: true,
                title: true,
            },
        } as const satisfies GlobalTestQuery)

        result?.posts?.slice()
        result?.posts?.[0].id
        result?.posts?.[0].title
        // @ts-expect-error must use ?. to prop
        result.posts[0].title
        // @ts-expect-error invalid field
        result?.posts?.[0].user_id

        // @ts-expect-error invalid prop
        result.vendors
    }

    {
        // infers entity name from prop
        const result = query_response({
            posts: {
                id: true,
            },
        } as const satisfies GlobalTestQuery)

        result?.posts?.slice()
        result?.posts?.[0].id
    }

    {
        // allows prop renaming
        const result = query_response({
            posts: {
                user_id: 'title',
                my_comments: 'id',
                total_views: {
                    $sum: 'views',
                },
            },
        } as const satisfies GlobalTestQuery)

        result?.posts?.slice()
        const user_id = result?.posts?.[0].user_id
        const my_comments = result?.posts?.[0].my_comments
        const total_views = result?.posts?.[0].total_views

        const expect1: IsEqual<typeof user_id, string | undefined> = true
        const expect2: IsEqual<typeof my_comments, number | undefined> = true
        const expect3: IsEqual<typeof total_views, any> = true
    }

    {
        // allows root aliases
        const result = query_response({
            my_posts: {
                $from: 'posts',
                id: true,
            },
        } as const satisfies GlobalTestQuery)

        result?.my_posts?.slice()
        const id = result?.my_posts?.[0].id

        const expect1: IsEqual<typeof id, number | undefined> = true
    }

    {
        // allows nested subquery aliases
        const result = query_response({
            users: {
                billing_address: {
                    id: true,
                    $from: 'addresses',
                    $foreign_key: ['billing_address_id'],
                },
            },
        } as const satisfies GlobalTestQuery)

        result.users?.slice()
        const id = result.users?.[0].billing_address?.[0].id

        const expect1: IsEqual<typeof id, number | undefined> = true
    }

    {
        type T = GetAllEdges<GlobalTestSchema, 'posts'>

        // allows nesting
        const result = query_response({
            posts: {
                comments: {
                    posts: {
                        title: true,
                    },
                },
            },
        } as const satisfies GlobalTestQuery)

        result?.posts?.slice()
        const inner_title = result?.posts?.[0].comments?.[0].posts?.[0].title

        const expect: IsEqual<typeof inner_title, string | undefined> = true
    }
    {
        // handles null
        const result = query_response({
            posts: {
                title: true,
                views: true,
            },
            users: {
                last_name: true,
            },
        } as const satisfies GlobalTestQuery)

        result?.posts?.slice()

        //the database cant return null, even though views has a default
        // and so doesnt have to be provided by the user in mutations
        const views = result?.posts?.[0].views
        const last_name = result?.users?.[0].last_name

        const expect1: IsEqual<typeof views, number | undefined> = true
        const expect2: IsEqual<typeof last_name, string | null | undefined> =
            true
    }
    {
        // excludes $ keywords
        const result = query_response({
            posts: {
                id: true,
                $where: {
                    $eq: ['id', { $escape: 1 }],
                },
            },
        })

        result?.posts?.slice()
        // @ts-expect-error
        result.posts?.[0].$where
    }
    {
        // results are mutable
        const result = query_response({
            posts: {
                title: true,
            },
        })

        result.posts?.map(post => {
            post.title = 'my cool title'
        })
    }
}
