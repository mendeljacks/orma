import { OrmaMutation } from '../../types/mutation/mutation_types'
import { OrmaQuery } from '../../types/query/query_types'
import { OrmaSchema } from '../../types/schema/schema_types'

export const global_test_schema = {
    $entities: {
        users: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    $data_type: 'int',
                    $auto_increment: true,
                    $not_null: true,
                },
                first_name: {
                    $data_type: 'varchar',
                },
                last_name: {
                    $data_type: 'varchar',
                },
                email: {
                    $data_type: 'varchar',
                    $not_null: true,
                },
                billing_address_id: {
                    $data_type: 'int',
                },
                shipping_address_id: {
                    $data_type: 'int',
                },
            },
            $primary_key: {
                $fields: ['id'],
            },
            $unique_keys: [
                {
                    $fields: ['email'],
                },
                {
                    $fields: ['first_name', 'last_name'],
                },
            ],
            $foreign_keys: [
                {
                    $fields: ['billing_address_id'],
                    $references: {
                        $entity: 'addresses',
                        $fields: ['id'],
                    },
                },
                {
                    $fields: ['shipping_address_id'],
                    $references: {
                        $entity: 'addresses',
                        $fields: ['id'],
                    },
                },
            ],
        },
        posts: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    $data_type: 'int',
                    $auto_increment: true,
                    $not_null: true,
                },
                user_id: {
                    $data_type: 'int',
                    $not_null: true,
                },
                views: {
                    $data_type: 'int',
                    $not_null: true,
                    $default: 0,
                },
            },
            $primary_key: {
                $fields: ['id'],
            },
            $foreign_keys: [
                {
                    $fields: ['user_id'],
                    $references: {
                        $entity: 'users',
                        $fields: ['id'],
                    },
                },
            ],
        },
        comments: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    $data_type: 'int',
                    $auto_increment: true,
                    $not_null: true,
                },
                post_id: {
                    $data_type: 'int',
                    $not_null: true,
                },
            },
            $primary_key: {
                $fields: ['id'],
            },
            $foreign_keys: [
                {
                    $fields: ['post_id'],
                    $references: {
                        $entity: 'posts',
                        $fields: ['id'],
                    },
                },
            ],
        },
        addresses: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    $data_type: 'int',
                    $auto_increment: true,
                    $not_null: true,
                },
                line_1: {
                    $data_type: 'varchar',
                },
                resource_id: {
                    $data_type: 'varchar',
                },
            },
            $unique_keys: [
                {
                    $fields: ['resource_id'],
                    $name: 'resource_uq',
                },
            ],
            $primary_key: {
                $fields: ['id'],
            },
        },
        categories: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    $data_type: 'int',
                    $auto_increment: true,
                    $not_null: true,
                },
                label: {
                    $data_type: 'varchar',
                    $not_null: true,
                },
                resource_id: {
                    $data_type: 'varchar',
                },
            },
            $primary_key: {
                $fields: ['id'],
            },
            $unique_keys: [
                {
                    $name: 'label_uq',
                    $fields: ['label'],
                },
                {
                    $name: 'resource_uq',
                    $fields: ['resource_id'],
                },
            ],
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
} as const satisfies OrmaSchema

export type GlobalTestSchema = typeof global_test_schema
export type GlobalTestQuery = OrmaQuery<GlobalTestSchema>
export type GlobalTestMutation = OrmaMutation<GlobalTestSchema>
