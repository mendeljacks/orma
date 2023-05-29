import { OrmaMutation } from '../types/mutation/mutation_types'
import { OrmaQuery } from '../types/query/query_types'
import { OrmaSchema } from '../types/schema/schema_types'

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
                title: {
                    $data_type: 'varchar',
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
            $unique_keys: [
                {
                    $name: 'unique_title',
                    $fields: ['title'],
                },
            ],
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
        likes: {
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
                post_id: {
                    $data_type: 'int',
                    $not_null: true,
                },
            },
            $primary_key: {
                $fields: ['id'],
            },
            $unique_keys: [
                {
                    $name: 'unique_user_id_post_id',
                    $fields: ['user_id', 'post_id'],
                },
            ],
            $foreign_keys: [
                {
                    $fields: ['user_id'],
                    $references: {
                        $entity: 'users',
                        $fields: ['id'],
                    },
                },
                {
                    $fields: ['post_id'],
                    $references: {
                        $entity: 'posts',
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
                tax_code_id: {
                    $data_type: 'int',
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
            $foreign_keys: [
                {
                    $fields: ['tax_code_id'],
                    $references: {
                        $entity: 'tax_codes',
                        $fields: ['id'],
                    },
                },
            ],
        },
        tax_codes: {
            $database_type: 'mysql',
            $fields: {
                id: {
                    $data_type: 'int',
                    $auto_increment: true,
                    $not_null: true,
                },
                tax_code: {
                    $data_type: 'enum',
                    $enum_values: ['TAX1', 'TAX2', 'TAX3'],
                },
            },
            $unique_keys: [
                {
                    $fields: ['tax_code'],
                    $name: 'tax_code_uq',
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
                    $precision: 10,
                },
                resource_id: {
                    $data_type: 'varchar',
                },
                size: {
                    $data_type: 'decimal',
                    $precision: 5,
                    $scale: 2,
                    $unsigned: true,
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
        post_has_categories: {
            $database_type: 'mysql',
            $fields: {
                post_id: {
                    $data_type: 'int',
                    $not_null: true,
                },
                category_id: {
                    $data_type: 'int',
                    $not_null: true,
                },
                main_category: {
                    $data_type: 'tinyint',
                    $precision: 1,
                },
            },
            $primary_key: {
                $fields: ['post_id', 'category_id'],
            },
            $foreign_keys: [
                {
                    $name: 'post_id_fk',
                    $fields: ['post_id'],
                    $references: {
                        $entity: 'posts',
                        $fields: ['id'],
                    },
                },
                {
                    $name: 'category_id_fk',
                    $fields: ['category_id'],
                    $references: {
                        $entity: 'categories',
                        $fields: ['id'],
                    },
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
            tax_codes: [
                {
                    from_field: 'id',
                    to_entity: 'addresses',
                    to_field: 'tax_code_id',
                },
            ],
            users: [
                { from_field: 'id', to_entity: 'posts', to_field: 'user_id' },
                { from_field: 'id', to_entity: 'likes', to_field: 'user_id' },
            ],
            posts: [
                { from_field: 'id', to_entity: 'likes', to_field: 'post_id' },
                {
                    from_field: 'id',
                    to_entity: 'comments',
                    to_field: 'post_id',
                },
                {
                    from_field: 'id',
                    to_entity: 'post_has_categories',
                    to_field: 'post_id',
                },
            ],
            categories: [
                {
                    from_field: 'id',
                    to_entity: 'post_has_categories',
                    to_field: 'category_id',
                },
            ],
        },
    },
} as const satisfies OrmaSchema

type G = typeof global_test_schema
export interface GlobalTestSchema extends G {}
export interface GlobalTestAliases {
    users: 'billing_address' | 'shipping_address'
    posts: 'total_views' | 'my_title' | 'my_comments',
    $root: 'my_posts'
    
}
export type GlobalTestQuery = OrmaQuery<GlobalTestSchema, GlobalTestAliases>
export type GlobalTestMutation = OrmaMutation<GlobalTestSchema>
