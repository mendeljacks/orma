import { GlobalTestQuery, GlobalTestSchema } from '../../helpers/tests/global_test_schema'
import { OrmaQuery, SimplifiedQuery, WhereConnected } from './query_types'

{
    const good: GlobalTestQuery = {
        likes: {
            id: 'post_id',
            post_id: true,
            user_id: {
                $sum: 'id',
            },
        },
    }

    const bad1: GlobalTestQuery = {
        likes: {
            // @ts-expect-error
            id: 'not_a_field',
            // @ts-expect-error
            post_id: 0,
        },
    }
}

{
    // known root entities
    const good1: GlobalTestQuery = {
        posts: {
            title: true,
        },
        users: {
            $from: 'users',
        },
    }

    // unknown root entities, has type inference based on $from
    const good2: GlobalTestQuery = {
        my_posts: {
            $from: 'posts',
            title: true,
        },
    }

    // nested subqueries
    const good3: GlobalTestQuery = {
        my_comments: {
            $from: 'comments',
            posts: {
                users: {
                    posts: {
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

    // orma actually doesnt allow this, since in this case a $from clause must
    // be provided, but the types allow this since I can't figure out
    // how to disallow it without ruining other parts of the type
    const good4: GlobalTestQuery = {
        my_posts: {
            title: true,
        },
    }

    // orma would not allow this, since regular nested fields cant start with $,
    // but I cant get typescript to only apply virtual fields type to strings
    // starting with $. I tried, but that basically caused the type checker
    // to become very unstable (ignoring types in some places but not others etc.)
    // I believe this is something to do with the way I tried it (enumerating ever
    // alphanumeric character except $) overloading the type checker with too
    // many code paths, but who knows for sure
    const good5: GlobalTestQuery = {
        posts: {
            $sum: 'id',
        },
    }

    // searching posts under the key images is disallowed on a type level.
    // Orma allows this, but I couldnt figure out how to be able to do this
    // and also have good intellisense (when I tried this, intellises for
    // { images: { ... }} would list every field of every entity rather than just
    // images, since technically you could do { images: { $from: 'products' }} and
    // then just put product fields on). So since this is an uncommon usecase,
    // if needed a user would just have to ts-ignore this (and potentially lost
    // typing on all subqueries of images)
    const b: GlobalTestQuery = {
        comments: {
            // @ts-expect-error
            $from: 'posts',
            id: true,
        },
    }
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
}

{
    // test group by
    const good: GlobalTestQuery = {
        posts: {
            $group_by: [
                'id',
                'asdasdasd',
                {
                    $sum: 'id',
                },
            ],
        },
    }
}

{
    // test order by
    const good: GlobalTestQuery = {
        psots: {
            $order_by: [
                'id',
                {
                    $asc: 'user_id',
                },
                {
                    $desc: 'asdasdasdsad',
                },
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
        products: {
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
