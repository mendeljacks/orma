import { orma_query } from '../..'
import { global_test_schema } from '../../helpers/tests/global_test_schema'
import { as_orma_query } from '../../query/query'

const t = () => {
    const query = as_orma_query(global_test_schema, {
        my_posts: {
            $from: 'posts',
            id: true,
            comments: {
                id: 'post_id',
            },
            $group_by: ['id'],
        },
    })

    orma_query(query, schema, async () => ({} as any)).then(result => {
        result.my_posts[0].id
        result.my_posts[0].comments[0].my_url
    })
}
