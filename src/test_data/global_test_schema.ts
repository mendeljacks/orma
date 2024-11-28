import { OrmaMutation } from '../types/mutation/mutation_types'
import { OrmaQuery } from '../types/query/query_types'
import { OrmaSchema } from '../schema/schema_types'

export const global_test_schema = {
    tables: {
        users: {
            database_type: 'sqlite',
            columns: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true
                },
                first_name: {
                    data_type: 'varchar'
                },
                last_name: {
                    data_type: 'varchar'
                },
                email: {
                    data_type: 'varchar',
                    not_null: true
                },
                billing_address_id: {
                    data_type: 'int'
                },
                shipping_address_id: {
                    data_type: 'int'
                }
            },
            primary_key: {
                columns: ['id']
            },
            unique_keys: [
                {
                    columns: ['email']
                },
                {
                    columns: ['first_name', 'last_name']
                }
            ],
            foreign_keys: [
                {
                    columns: ['billing_address_id'],
                    referenced_table: 'addresses',
                    referenced_columns: ['id']
                },
                {
                    columns: ['shipping_address_id'],
                    referenced_table: 'addresses',
                    referenced_columns: ['id']
                }
            ]
        },
        posts: {
            database_type: 'sqlite',
            columns: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true
                },
                user_id: {
                    data_type: 'int',
                    not_null: true
                },
                title: {
                    data_type: 'varchar',
                    not_null: true
                },
                views: {
                    data_type: 'int',
                    not_null: true,
                    default: 0
                }
            },
            primary_key: {
                columns: ['id']
            },
            unique_keys: [
                {
                    name: 'unique_title',
                    columns: ['title']
                }
            ],
            foreign_keys: [
                {
                    columns: ['user_id'],
                    referenced_table: 'users',
                    referenced_columns: ['id']
                }
            ]
        },
        likes: {
            database_type: 'sqlite',
            columns: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true
                },
                user_id: {
                    data_type: 'int',
                    not_null: true
                },
                post_id: {
                    data_type: 'int',
                    not_null: true
                }
            },
            primary_key: {
                columns: ['id']
            },
            unique_keys: [
                {
                    name: 'unique_user_id_post_id',
                    columns: ['user_id', 'post_id']
                }
            ],
            foreign_keys: [
                {
                    columns: ['user_id'],
                    referenced_table: 'users',
                    referenced_columns: ['id']
                },
                {
                    columns: ['post_id'],
                    referenced_table: 'posts',
                    referenced_columns: ['id']
                }
            ]
        },
        comments: {
            database_type: 'sqlite',
            columns: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true
                },
                post_id: {
                    data_type: 'int',
                    not_null: true
                }
            },
            primary_key: {
                columns: ['id']
            },
            foreign_keys: [
                {
                    columns: ['post_id'],
                    referenced_table: 'posts',
                    referenced_columns: ['id']
                }
            ]
        },
        addresses: {
            database_type: 'sqlite',
            columns: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true
                },
                line_1: {
                    data_type: 'varchar'
                },
                resource_id: {
                    data_type: 'varchar'
                },
                tax_code_id: {
                    data_type: 'int'
                }
            },
            unique_keys: [
                {
                    columns: ['resource_id'],
                    name: 'resource_uq'
                }
            ],
            primary_key: {
                columns: ['id']
            },
            foreign_keys: [
                {
                    columns: ['tax_code_id'],
                    referenced_table: 'tax_codes',
                    referenced_columns: ['id']
                }
            ]
        },
        tax_codes: {
            database_type: 'sqlite',
            columns: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true
                },
                tax_code: {
                    data_type: 'enum',
                    enum_values: ['TAX1', 'TAX2', 'TAX3'],
                    not_null: true
                },
                tax_subcode: {
                    data_type: 'varchar'
                }
            },
            unique_keys: [
                {
                    columns: ['tax_code', 'tax_subcode'],
                    name: 'tax_code_uq'
                }
            ],
            primary_key: {
                columns: ['id']
            }
        },
        categories: {
            database_type: 'sqlite',
            columns: {
                id: {
                    data_type: 'int',
                    auto_increment: true,
                    not_null: true
                },
                label: {
                    data_type: 'varchar',
                    not_null: true,
                    precision: 10
                },
                parent_category_id: { data_type: 'int' },
                resource_id: {
                    data_type: 'varchar'
                },
                size: {
                    data_type: 'decimal',
                    precision: 5,
                    scale: 2,
                    unsigned: true
                }
            },
            primary_key: {
                columns: ['id']
            },
            unique_keys: [
                {
                    name: 'label_uq',
                    columns: ['label']
                },
                {
                    name: 'resource_uq',
                    columns: ['resource_id']
                }
            ],
            foreign_keys: [
                {
                    columns: ['parent_category_id'],
                    referenced_table: 'categories',
                    referenced_columns: ['id']
                }
            ]
        },
        post_has_categories: {
            database_type: 'sqlite',
            columns: {
                post_id: {
                    data_type: 'int',
                    not_null: true
                },
                category_id: {
                    data_type: 'int',
                    not_null: true
                },
                main_category: {
                    data_type: 'tinyint',
                    precision: 1
                }
            },
            primary_key: {
                columns: ['post_id', 'category_id']
            },
            foreign_keys: [
                {
                    name: 'post_id_fk',
                    columns: ['post_id'],
                    referenced_table: 'posts',
                    referenced_columns: ['id']
                },
                {
                    name: 'category_id_fk',
                    columns: ['category_id'],
                    referenced_table: 'categories',
                    referenced_columns: ['id']
                }
            ]
        }
    },
    cache: {
        foreign_keys_by_parent: {
            addresses: [
                {
                    referenced_table: 'addresses',
                    referenced_columns: ['id'],
                    table: 'users',
                    columns: ['billing_address_id']
                },
                {
                    referenced_table: 'addresses',
                    referenced_columns: ['id'],
                    table: 'users',
                    columns: ['shipping_address_id']
                }
            ],
            tax_codes: [
                {
                    referenced_table: 'tax_codes',
                    referenced_columns: ['id'],
                    table: 'addresses',
                    columns: ['tax_code_id']
                }
            ],
            users: [
                {
                    referenced_table: 'users',
                    referenced_columns: ['id'],
                    table: 'posts',
                    columns: ['user_id']
                },
                {
                    referenced_table: 'users',
                    referenced_columns: ['id'],
                    table: 'likes',
                    columns: ['user_id']
                }
            ],
            posts: [
                {
                    referenced_table: 'posts',
                    referenced_columns: ['id'],
                    table: 'likes',
                    columns: ['post_id']
                },
                {
                    referenced_table: 'posts',
                    referenced_columns: ['id'],
                    table: 'comments',
                    columns: ['post_id']
                },
                {
                    referenced_table: 'posts',
                    referenced_columns: ['id'],
                    table: 'post_has_categories',
                    columns: ['post_id']
                }
            ],
            categories: [
                {
                    referenced_table: 'categories',
                    referenced_columns: ['id'],
                    table: 'post_has_categories',
                    columns: ['category_id']
                },
                {
                    referenced_table: 'categories',
                    referenced_columns: ['id'],
                    table: 'categories',
                    columns: ['parent_category_id']
                }
            ]
        }
    }
} as const satisfies OrmaSchema

type G = typeof global_test_schema
export interface GlobalTestSchema extends G {}
export interface GlobalTestAliases {
    users: 'billing_address' | 'shipping_address'
    posts: 'total_views' | 'my_title' | 'my_comments'
    root: 'my_posts'
}
export type GlobalTestQuery = OrmaQuery<GlobalTestSchema, GlobalTestAliases>
export type GlobalTestMutation = OrmaMutation<GlobalTestSchema>
