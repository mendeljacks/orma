import { as_orma_schema } from '../../introspector/introspector'

export const global_test_schema = as_orma_schema({
    $entities: {
        users: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true,
                    primary_key: true,
                },
                first_name: {
                    data_type: 'varchar',
                    not_null: true,
                },
                last_name: {
                    data_type: 'varchar',
                },
                email: {
                    data_type: 'varchar',
                    not_null: true,
                },
                billing_address_id: {
                    data_type: 'int',
                    not_null: true,
                },
                shipping_address_id: {
                    data_type: 'int',
                    not_null: true,
                },
            },
            $indexes: [
                {
                    fields: ['email'],
                    is_unique: true,
                },
            ],
            $foreign_keys: [
                {
                    from_field: 'billing_address_id',
                    to_entity: 'addresses',
                    to_field: 'id',
                },
                {
                    from_field: 'shipping_address_id',
                    to_entity: 'addresses',
                    to_field: 'id',
                },
            ],
        },
        posts: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true,
                    primary_key: true,
                },
                user_id: {
                    data_type: 'int',
                    not_null: true,
                },
                views: {
                    data_type: 'int',
                    not_null: true,
                    default: 0,
                },
            },
            $foreign_keys: [
                {
                    from_field: 'user_id',
                    to_entity: 'users',
                    to_field: 'id',
                },
            ],
        },
        comments: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true,
                    primary_key: true,
                },
                post_id: {
                    data_type: 'int',
                    not_null: true,
                },
            },
        },
        addresses: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true,
                    primary_key: true,
                },
                line_1: {
                    data_type: 'varchar',
                },
            },
        },
    },
    $cache: {
        $reversed_foreign_keys: {
            addresses: [
                {
                    from_field: 'id',
                    to_entity: 'users',
                    to_field: 'billing_address_id',
                },
                {
                    from_field: 'id',
                    to_entity: 'users',
                    to_field: 'shipping_address_id',
                },
            ],
            users: [
                {
                    from_field: 'id',
                    to_entity: 'posts',
                    to_field: 'user_id',
                },
            ],
            posts: [
                {
                    from_field: 'id',
                    to_entity: 'comments',
                    to_field: 'post_id',
                },
            ],
        },
    },
} as const)
