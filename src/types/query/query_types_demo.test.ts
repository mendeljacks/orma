import { OrmaQueryResult, orma_query } from '../..'
import {
    GlobalTestAliases,
    GlobalTestQuery,
    GlobalTestSchema,
    global_test_schema,
} from '../../test_data/global_test_schema'
import { QueryResultComplex } from './query_result_types'

const t = () => {
    const query = {
        my_posts: {
            $from: 'posts',
            id: true,
            comments: {
                id: 'post_id',
            },
            $group_by: ['id'],
        },
    } as const satisfies GlobalTestQuery

    // orma_query<GlobalTestSchema, GlobalTestAliases, typeof query>(
    //     query,
    //     global_test_schema,
    //     async () => ({} as any)
    // ).then(result => {
    //     // result.my_posts[0].id
    //     // result.my_posts[0].comments[0].id

    //     const r: OrmaQueryResult<
    //         GlobalTestSchema,
    //         GlobalTestAliases,
    //         typeof query
    //     > = {}
    // })

    type T = QueryResultComplex<
        GlobalTestSchema,
        GlobalTestAliases,
        typeof query
    >
}
