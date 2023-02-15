import { orma_query } from '../..'
import {
    GlobalTestQuery,
    global_test_schema,
} from '../../helpers/tests/global_test_schema'

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

    orma_query(query, global_test_schema, async () => ({} as any)).then(
        result => {
            result.my_posts[0].id
            result.my_posts[0].comments[0].id
        }
    )
}
