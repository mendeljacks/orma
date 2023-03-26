import {
    GlobalTestQuery,
    GlobalTestSchema,
} from '../../test_data/global_test_schema'
import { as_orma_schema } from '../../schema/introspector'
import { IsEqual } from '../helper_types'
import { GetAllEdges, GetFieldType } from '../schema/schema_helper_types'
import { QueryResult } from './query_result_types'
import { OrmaQuery } from './query_types'

const test = () => {
    const query_response = <Query extends OrmaQuery<GlobalTestSchema>>(
        query: Query
    ): QueryResult<GlobalTestSchema, Query> => '' as any

    {
        // data props propagate as arrays
        const result = query_response({
            posts: {
                $from: 'posts',
                id: true,
                name: true,
            },
        } as const satisfies GlobalTestQuery)

        result.posts.slice()
        result.posts[0].id
        result.posts[0].name

        // @ts-expect-error
        result.vendors
    }

    {
        // infers entity name from prop
        const result = query_response({
            posts: {
                id: true,
            },
        } as const satisfies GlobalTestQuery)

        result.posts.slice()
        result.posts[0].id
    }

    {
        // allows prop renaming
        const result = query_response({
            posts: {
                my_id: 'id',
            },
        } as const satisfies GlobalTestQuery)

        result.posts.slice()
        const my_id = result.posts[0].my_id
        const expect: IsEqual<typeof my_id, number> = true
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

        result.posts.slice()
        result.posts[0].comments[0].posts[0].title
    }
    {
        // handles null
        const result = query_response({
            posts: {
                id: true,
                title: true,
                views: true,
            },
            users: {
                last_name: true,
            },
        } as const satisfies GlobalTestQuery)

        result.posts.slice()
        result.posts[0].id = 1
        //@ts-expect-error
        result.posts[0].id = null
        //@ts-expect-error the database cant return null, even though views has a default
        // and so doesnt have to be provided by the user in mutations
        result.posts[0].views = null
        result.users[0].last_name = null
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

        result.posts.slice()
        // @ts-expect-error
        result.posts[0].$where
    }
}
