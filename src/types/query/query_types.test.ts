import { as_orma_query } from '../../query/query'
import {
    GlobalTestAliases,
    GlobalTestQuery,
    GlobalTestSchema,
    global_test_schema,
} from '../../test_data/global_test_schema'
import { FieldObj, SimplifiedQuery } from './query_types'

{
    // allows fields and aliases
    const good: GlobalTestQuery = {
        posts: {
            id: 'user_id',
            title: true,
            user_id: {
                $sum: 'id',
            },
            total_views: {
                $sum: 'id',
            },
        },
    }

    // cant give nonsensical values
    const bad1: GlobalTestQuery = {
        likes: {
            // @ts-expect-error
            id: 'asdasdasdasd',
            // @ts-expect-error
            post_id: 0,
        },
    }

    // aliased field can't use true
    const bad2: GlobalTestQuery = {
        posts: {
            //@ts-expect-error
            total_views: true,
        },
    }
}

{
    // gets entity from proeprty name
    const good1: GlobalTestQuery = {
        posts: {
            title: true,
        },
        users: {
            $from: 'users',
        },
    }

    // gets entity from $from
    const good2: GlobalTestQuery = {
        my_posts: {
            $from: 'posts',
            title: true,
        },
    }

    // nested subqueries
    const good3: GlobalTestQuery = {
        my_posts: {
            $from: 'posts',
            users: {
                posts: {
                    users: {
                        id: true,
                    },
                },
            },
        },
        comments: {
            posts: {
                id: true,
            },
        },
    }

    // requires $from for aliased property
    const good4: GlobalTestQuery = {
        //@ts-expect-error
        billing_address: {
            title: true,
        },
    }

    // Although this is actually possible in orma - the $from clause takes precendence over the property name -
    // typescript wont allow it. Anyway this is confusing so shouldnt be done in practice.
    const b: GlobalTestQuery = {
        comments: {
            // @ts-expect-error
            $from: 'posts',
            id: true,
        },
    }
}

{
    // test $as with subquery
    const good = {
        posts: {
            id: true,
            $select: [{ $as: [{ $select: ['id'], $from: 'posts' }, 'id'] }],
        },
    } as const satisfies GlobalTestQuery
}

{
    // test pagination
    type test = GlobalTestQuery
    const good: test = {
        posts: {
            $limit: 1,
            $offset: 2,
        },
    }

    const bad: test = {
        posts: {
            //@ts-expect-error
            $limit: 'id',
            //@ts-expect-error
            $offset: { $from: 'users' },
        },
    }
}

{
    // test group by
    const good: GlobalTestQuery = {
        posts: {
            total_views: {
                $sum: 'views',
            },
            $group_by: [
                'id',
                'total_views',
                //@ts-expect-error
                'asdasdasd',
                {
                    $sum: 'total_views',
                },
            ],
        },
    }
}

{
    // test order by
    const good: GlobalTestQuery = {
        posts: {
            $order_by: [
                'id',
                {
                    $asc: 'user_id',
                },
                {
                    $desc: 'total_views',
                },
                //@ts-expect-error
                'asdjaskdhasjd',
            ],
        },
    }

    const bad1: GlobalTestQuery = {
        posts: {
            // @ts-expect-error must be an array
            $order_by: 'id',
        },
    }

    const bad2: GlobalTestQuery = {
        posts: {
            $order_by: [
                {
                    // @ts-expect-error
                    $not_a_real_keyword: 'id',
                },
            ],
        },
    }
}

{
    // handles where clause
    const good: GlobalTestQuery = {
        posts: {
            id: true,
            $where: {
                $eq: ['id', { $escape: true }],
            },
        },
    }
}

{
    // handles $where_connected macro
    const good: GlobalTestQuery = {
        $where_connected: [
            {
                $entity: 'users',
                $field: 'id',
                $values: [1, 'a'],
            },
        ],
    }

    const bad: GlobalTestQuery = {
        $where_connected: [
            {
                // @ts-expect-error
                $entity: 'users',
                // @ts-ignore
                $field: 'post_id', // this is invalid since post_id is not a field of users
                $values: [1, 'a'],
            },
        ],
    }
}

{
    // Simplified query
    const good: SimplifiedQuery<GlobalTestSchema> = {
        posts: {
            id: true,
            user_id: true,
            users: {
                id: true,
            },
        },
    }

    const good2: SimplifiedQuery<GlobalTestSchema> = {}

    const bad: SimplifiedQuery<GlobalTestSchema> = {
        posts: {
            comments: {
                id: true,
            },
        },
    }
}

{
    const t = {
        posts: {
            id: true,
            my_title: {
                $escape: 123,
            },
        },
    } as const satisfies GlobalTestQuery
}
