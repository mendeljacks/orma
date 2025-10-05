import { expect } from 'chai'
import { describe, test } from 'mocha'
import { clone } from '../../helpers/helpers'
import { global_test_schema } from '../../test_data/global_test_schema'
import { OrmaSchema } from '../../schema/schema_types'
import {
    apply_where_connected_macro,
    get_upwards_connection_edges,
    restrict_where_connected
} from './where_connected_macro'

describe('where_connected_macro.ts', () => {
    describe(get_upwards_connection_edges.name, () => {
        test('handles multiple tables', () => {
            const schema: OrmaSchema = {
                tables: {
                    grandparents: {
<<<<<<< HEAD
                        columns: { id: { $data_type: 'int' } },
                        database_type: 'mysql',
                        primary_key: {
                            $columns: ['id'],
                        },
=======
                        $fields: { id: { $data_type: 'int' } },
                        $database_type: 'mysql',
                        $primary_key: {
                            $fields: ['id']
                        }
>>>>>>> origin/master
                    },
                    parents: {
                        columns: {
                            id: { $data_type: 'int' },
                            grandparent_id: { $data_type: 'int' }
                        },
                        database_type: 'mysql',
                        foreign_keys: [
                            {
                                $columns: ['grandparent_id'],
                                $references: {
<<<<<<< HEAD
                                    $table: 'grandparents',
                                    $columns: ['id'],
                                },
                            },
                        ],
                        primary_key: {
                            $columns: ['id'],
                        },
=======
                                    $entity: 'grandparents',
                                    $fields: ['id']
                                }
                            }
                        ],
                        $primary_key: {
                            $fields: ['id']
                        }
>>>>>>> origin/master
                    },
                    children: {
                        columns: {
                            id: { $data_type: 'int' },
                            parent_id: { $data_type: 'int' }
                        },
                        database_type: 'mysql',
                        foreign_keys: [
                            {
                                $columns: ['parent_id'],
                                $references: {
<<<<<<< HEAD
                                    $table: 'parents',
                                    $columns: ['id'],
                                },
                            },
                        ],
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
=======
                                    $entity: 'parents',
                                    $fields: ['id']
                                }
                            }
                        ],
                        $primary_key: {
                            $fields: ['id']
                        }
                    }
>>>>>>> origin/master
                },
                cache: {
                    reversed_foreign_keys: {
                        grandparents: [
                            {
<<<<<<< HEAD
                                from_columns: 'id',
                                to_table: 'parents',
                                to_columns: 'grandparent_id',
                            },
                        ],
                        parents: [
                            {
                                from_columns: 'id',
                                to_table: 'children',
                                to_columns: 'parent_id',
                            },
                        ],
                    },
                },
=======
                                from_field: 'id',
                                to_entity: 'parents',
                                to_field: 'grandparent_id'
                            }
                        ],
                        parents: [
                            {
                                from_field: 'id',
                                to_entity: 'children',
                                to_field: 'parent_id'
                            }
                        ]
                    }
                }
>>>>>>> origin/master
            }

            const connection_paths = get_upwards_connection_edges(schema)

            expect(connection_paths).to.deep.equal({
                parents: [
                    {
<<<<<<< HEAD
                        from_table: 'parents',
                        from_column: 'grandparent_id',
                        to_table: 'grandparents',
                        to_column: 'id',
                    },
                ],
                children: [
                    {
                        from_table: 'children',
                        from_column: 'parent_id',
                        to_table: 'parents',
                        to_column: 'id',
                    },
                ],
=======
                        from_entity: 'parents',
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id'
                    }
                ],
                children: [
                    {
                        from_entity: 'children',
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id'
                    }
                ]
>>>>>>> origin/master
            })
        })
        test('handles multiple edges', () => {
            const schema: OrmaSchema = {
                tables: {
                    parents: {
<<<<<<< HEAD
                        columns: { id: { $data_type: 'int' } },
                        database_type: 'mysql',
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
                    parents_2: {
                        columns: { id: { $data_type: 'int' } },
                        database_type: 'mysql',
                        primary_key: {
                            $columns: ['id'],
                        },
=======
                        $fields: { id: { $data_type: 'int' } },
                        $database_type: 'mysql',
                        $primary_key: {
                            $fields: ['id']
                        }
                    },
                    parents_2: {
                        $fields: { id: { $data_type: 'int' } },
                        $database_type: 'mysql',
                        $primary_key: {
                            $fields: ['id']
                        }
>>>>>>> origin/master
                    },
                    children: {
                        columns: {
                            id: { $data_type: 'int' },
                            parent_id: { $data_type: 'int' },
                            parents_2_id: { $data_type: 'int' }
                        },
                        database_type: 'mysql',
                        foreign_keys: [
                            {
                                $columns: ['parent_id'],
                                $references: {
<<<<<<< HEAD
                                    $table: 'parents',
                                    $columns: ['id'],
                                },
=======
                                    $entity: 'parents',
                                    $fields: ['id']
                                }
>>>>>>> origin/master
                            },
                            {
                                $columns: ['parents_2_id'],
                                $references: {
<<<<<<< HEAD
                                    $table: 'parents_2',
                                    $columns: ['id'],
                                },
                            },
                        ],
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
=======
                                    $entity: 'parents_2',
                                    $fields: ['id']
                                }
                            }
                        ],
                        $primary_key: {
                            $fields: ['id']
                        }
                    }
>>>>>>> origin/master
                },
                cache: {
                    reversed_foreign_keys: {
                        parents: [
                            {
<<<<<<< HEAD
                                from_columns: 'id',
                                to_table: 'children',
                                to_columns: 'parent_id',
                            },
                        ],
                        parents_2: [
                            {
                                from_columns: 'id',
                                to_table: 'children',
                                to_columns: 'parents_2_id',
                            },
                        ],
                    },
                },
=======
                                from_field: 'id',
                                to_entity: 'children',
                                to_field: 'parent_id'
                            }
                        ],
                        parents_2: [
                            {
                                from_field: 'id',
                                to_entity: 'children',
                                to_field: 'parents_2_id'
                            }
                        ]
                    }
                }
>>>>>>> origin/master
            }

            const connection_paths = get_upwards_connection_edges(schema)

            expect(connection_paths).to.deep.equal({
                children: [
                    {
<<<<<<< HEAD
                        from_table: 'children',
                        from_column: 'parent_id',
                        to_table: 'parents',
                        to_column: 'id',
                    },
                    {
                        from_table: 'children',
                        from_column: 'parents_2_id',
                        to_table: 'parents_2',
                        to_column: 'id',
                    },
                ],
=======
                        from_entity: 'children',
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id'
                    },
                    {
                        from_entity: 'children',
                        from_field: 'parents_2_id',
                        to_entity: 'parents_2',
                        to_field: 'id'
                    }
                ]
>>>>>>> origin/master
            })
        })
        test('skips edges from an table to itself', () => {
            const schema: OrmaSchema = {
                tables: {
                    table: {
                        columns: {
                            id: { $data_type: 'int' },
<<<<<<< HEAD
                            table_id: { $data_type: 'int' },
=======
                            entity_id: { $data_type: 'int' }
>>>>>>> origin/master
                        },
                        database_type: 'mysql',
                        foreign_keys: [
                            {
                                $columns: ['table_id'],
                                $references: {
<<<<<<< HEAD
                                    $table: 'table',
                                    $columns: ['id'],
                                },
                            },
                        ],
                        primary_key: {
                            $columns: ['id'],
                        },
                    },
=======
                                    $entity: 'entity',
                                    $fields: ['id']
                                }
                            }
                        ],
                        $primary_key: {
                            $fields: ['id']
                        }
                    }
>>>>>>> origin/master
                },
                cache: {
                    reversed_foreign_keys: {
                        table: [
                            {
<<<<<<< HEAD
                                from_columns: 'id',
                                to_table: 'table',
                                to_columns: 'table_id',
                            },
                        ],
                    },
                },
=======
                                from_field: 'id',
                                to_entity: 'entity',
                                to_field: 'entity_id'
                            }
                        ]
                    }
                }
>>>>>>> origin/master
            }

            const connection_paths = get_upwards_connection_edges(schema)

            expect(connection_paths).to.deep.equal({})
        })
    })
    describe(apply_where_connected_macro.name, () => {
        test('handles nested tables', () => {
            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
=======
                        $entity: 'users',
                        $field: 'id',
                        $values: [1, 2]
                    }
>>>>>>> origin/master
                ],
                comments: {
                    id: true
                }
            }

            apply_where_connected_macro(global_test_schema, query, {
                comments: [
                    {
<<<<<<< HEAD
                        from_column: 'post_id',
                        to_table: 'posts',
                        to_column: 'id',
                    },
                ],
                posts: [
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
=======
                        from_field: 'post_id',
                        to_entity: 'posts',
                        to_field: 'id'
                    }
                ],
                posts: [
                    {
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id'
                    }
                ]
>>>>>>> origin/master
            })

            // @ts-ignore
            expect(query.comments.$where).to.deep.equal({
                $in: [
                    'post_id',
                    {
                        $select: ['id'],
                        $from: 'posts',
                        $where: {
                            $in: [
                                'user_id',
                                {
                                    $select: ['id'],
                                    $from: 'users',
                                    $where: {
                                        $in: ['id', [1, 2]]
                                    }
                                }
                            ]
                        }
                    }
                ]
            })
        })
        test('handles multiple connection paths', () => {
            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
=======
                        $entity: 'users',
                        $field: 'id',
                        $values: [1, 2]
                    }
>>>>>>> origin/master
                ],
                likes: {
                    id: true
                }
            }

            apply_where_connected_macro(global_test_schema, query, {
                likes: [
                    {
<<<<<<< HEAD
                        from_column: 'post_id',
                        to_table: 'posts',
                        to_column: 'id',
                    },
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
                posts: [
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
=======
                        from_field: 'post_id',
                        to_entity: 'posts',
                        to_field: 'id'
                    },
                    {
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id'
                    }
                ],
                posts: [
                    {
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id'
                    }
                ]
>>>>>>> origin/master
            })

            // @ts-ignore
            expect(query.likes.$where).to.deep.equal({
                $or: [
                    {
                        $in: [
                            'user_id',
                            {
                                $select: ['id'],
                                $from: 'users',
                                $where: {
                                    $in: ['id', [1, 2]]
                                }
                            }
                        ]
                    },
                    {
                        $in: [
                            'post_id',
                            {
                                $select: ['id'],
                                $from: 'posts',
                                $where: {
                                    $in: [
                                        'user_id',
                                        {
                                            $select: ['id'],
                                            $from: 'users',
                                            $where: {
                                                $in: ['id', [1, 2]]
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            })
        })
        test('combines with existing $where clause', () => {
            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
=======
                        $entity: 'users',
                        $field: 'id',
                        $values: [1, 2]
                    }
>>>>>>> origin/master
                ],
                posts: {
                    id: true,
                    $where: {
                        $eq: ['id', 13]
                    }
                }
            }

            // notice we are using backwards nesting here, this is supported for example if the user specified
            // some backwards parent -> child connections to add to the child -> parent ones generated by orma
            apply_where_connected_macro(global_test_schema, query, {
                posts: [
                    {
<<<<<<< HEAD
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
=======
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id'
                    }
                ]
>>>>>>> origin/master
            })

            // @ts-ignore
            expect(query.posts.$where).to.deep.equal({
                $and: [
                    {
                        $eq: ['id', 13]
                    },
                    {
                        $in: [
                            'user_id',
                            {
                                $select: ['id'],
                                $from: 'users',
                                $where: {
                                    $in: ['id', [1, 2]]
                                }
                            }
                        ]
                    }
                ]
            })
        })
        test('applies to $where $in clauses', () => {
            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
=======
                        $entity: 'users',
                        $field: 'id',
                        $values: [1, 2]
                    }
>>>>>>> origin/master
                ],
                comments: {
                    id: true,
                    $where: {
                        and: [
                            {
                                $in: [
                                    'post_id',
                                    {
                                        $select: ['id'],
                                        $from: 'posts'
                                    }
                                ]
                            }
                        ]
                    }
                }
            }

            apply_where_connected_macro(global_test_schema, query, {
                posts: [
                    {
<<<<<<< HEAD
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
=======
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id'
                    }
                ]
>>>>>>> origin/master
            })

            // @ts-ignore
            expect(query.comments.$where.and[0].$in[1].$where).to.deep.equal({
                $in: [
                    'user_id',
                    {
                        $select: ['id'],
                        $from: 'users',
                        $where: {
                            $in: ['id', [1, 2]]
                        }
                    }
                ]
            })
        })
        test.skip('skips regularly nested subqueries', () => {
            // add this test back after properly considering the optimization
            // in all cases (i.e. reverse nesting)
            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        $table: 'grandparents',
                        $column: 'id',
                        $values: [1, 2],
                    },
=======
                        $entity: 'grandparents',
                        $field: 'id',
                        $values: [1, 2]
                    }
>>>>>>> origin/master
                ],
                parents: {
                    id: true,
                    children: {
                        id: true
                    }
                }
            }

            // notice we are using backwards nesting here, this is supported for example if the user specified
            // some backwards parent -> child connections to add to the child -> parent ones generated by orma
            apply_where_connected_macro(global_test_schema, query, {
                children: [
                    {
<<<<<<< HEAD
                        from_column: 'parent_id',
                        to_table: 'parents',
                        to_column: 'id',
                    },
                ],
                parents: [
                    {
                        from_column: 'grandparent_id',
                        to_table: 'grandparents',
                        to_column: 'id',
                    },
                ],
=======
                        from_field: 'parent_id',
                        to_entity: 'parents',
                        to_field: 'id'
                    }
                ],
                parents: [
                    {
                        from_field: 'grandparent_id',
                        to_entity: 'grandparents',
                        to_field: 'id'
                    }
                ]
>>>>>>> origin/master
            })

            // @ts-ignore
            expect(query.parents.$where).to.not.equal(undefined)
            // @ts-ignore
            expect(query.parents.children.$where).to.equal(undefined)
        })
        test('applies where connected to the table itself', () => {
            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
=======
                        $entity: 'users',
                        $field: 'id',
                        $values: [1, 2]
                    }
>>>>>>> origin/master
                ],
                users: {
                    id: true
                }
            }

            // notice we are using backwards nesting here, this is supported for example if the user specified
            // some backwards parent -> child connections to add to the child -> parent ones generated by orma
            apply_where_connected_macro(global_test_schema, query, {})

            // @ts-ignore
            expect(query.users.$where).to.deep.equal({
                $in: ['id', [1, 2]]
            })
        })
        test('handles nullable foreign keys', () => {
            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        $table: 'addresses',
                        $column: 'id',
                        $values: [1, 2],
                    },
=======
                        $entity: 'addresses',
                        $field: 'id',
                        $values: [1, 2]
                    }
>>>>>>> origin/master
                ],
                users: {
                    id: true
                }
            }

            apply_where_connected_macro(global_test_schema, query, {
                users: [
                    {
<<<<<<< HEAD
                        from_column: 'billing_address_id',
                        to_table: 'addresses',
                        to_column: 'id',
                    },
                ],
=======
                        from_field: 'billing_address_id',
                        to_entity: 'addresses',
                        to_field: 'id'
                    }
                ]
>>>>>>> origin/master
            })

            // @ts-ignore
            expect(query.users.$where).to.deep.equal({
                $or: [
                    {
                        $and: [
                            {
                                $not: {
                                    $eq: ['billing_address_id', null]
                                }
                            },
                            {
                                $in: [
                                    'billing_address_id',
                                    {
                                        $select: ['id'],
                                        $from: 'addresses',
                                        $where: {
                                            $in: ['id', [1, 2]]
                                        }
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        $eq: ['billing_address_id', null]
                    }
                ]
            })
        })
        test('handles reversed nullable foreign keys', () => {
            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
=======
                        $entity: 'users',
                        $field: 'id',
                        $values: [1, 2]
                    }
>>>>>>> origin/master
                ],
                addresses: {
                    id: true
                }
            }

            apply_where_connected_macro(global_test_schema, query, {
                addresses: [
                    {
<<<<<<< HEAD
                        from_column: 'id',
                        to_table: 'users',
                        to_column: 'billing_address_id',
                    },
                ],
=======
                        from_field: 'id',
                        to_entity: 'users',
                        to_field: 'billing_address_id'
                    }
                ]
>>>>>>> origin/master
            })

            // @ts-ignore
            expect(query.addresses.$where).to.deep.equal({
                $or: [
                    {
                        $in: [
                            'id',
                            {
                                $select: ['billing_address_id'],
                                $from: 'users',
                                $where: {
                                    $and: [
                                        {
                                            $not: {
                                                $eq: [
                                                    'billing_address_id',
                                                    null
                                                ]
                                            }
                                        },
                                        { $in: ['id', [1, 2]] }
                                    ]
                                }
                            }
                        ]
                    },
                    {
                        $not: {
                            $in: [
                                'id',
                                {
                                    $select: ['billing_address_id'],
                                    $from: 'users',
                                    $where: {
                                        $not: {
                                            $eq: ['billing_address_id', null]
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            })
        })
        test('handles nullable and non-nullable foreign keys together', () => {
            const schema: OrmaSchema = {
                ...global_test_schema,
                tables: {
                    ...global_test_schema.$tables,
                    likes: {
<<<<<<< HEAD
                        ...global_test_schema.$tables.likes,
                        columns: {
                            ...global_test_schema.$tables.likes.$columns,
                            user_id: { $data_type: 'int' }, // make nullable
                        },
                    },
                },
=======
                        ...global_test_schema.$entities.likes,
                        $fields: {
                            ...global_test_schema.$entities.likes.$fields,
                            user_id: { $data_type: 'int' } // make nullable
                        }
                    }
                }
>>>>>>> origin/master
            }

            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
=======
                        $entity: 'users',
                        $field: 'id',
                        $values: [1, 2]
                    }
>>>>>>> origin/master
                ],
                likes: {
                    id: true
                }
            }

            apply_where_connected_macro(schema, query, {
                likes: [
                    {
<<<<<<< HEAD
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                    {
                        from_column: 'post_id',
                        to_table: 'posts',
                        to_column: 'id',
                    },
                ],
                posts: [
                    {
                        from_column: 'user_id',
                        to_table: 'users',
                        to_column: 'id',
                    },
                ],
=======
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id'
                    },
                    {
                        from_field: 'post_id',
                        to_entity: 'posts',
                        to_field: 'id'
                    }
                ],
                posts: [
                    {
                        from_field: 'user_id',
                        to_entity: 'users',
                        to_field: 'id'
                    }
                ]
>>>>>>> origin/master
            })

            // @ts-ignore
            expect(query.likes.$where).to.deep.equal({
                $or: [
                    {
                        $and: [
                            { $not: { $eq: ['user_id', null] } },
                            {
                                $in: [
                                    'user_id',
                                    {
                                        $select: ['id'],
                                        $from: 'users',
                                        $where: { $in: ['id', [1, 2]] }
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        $in: [
                            'post_id',
                            {
                                $select: ['id'],
                                $from: 'posts',
                                $where: {
                                    $in: [
                                        'user_id',
                                        {
                                            $select: ['id'],
                                            $from: 'users',
                                            $where: { $in: ['id', [1, 2]] }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            })
        })
        test('handles no connection paths', () => {
            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        $table: 'users',
                        $column: 'id',
                        $values: [1, 2],
                    },
=======
                        $entity: 'users',
                        $field: 'id',
                        $values: [1, 2]
                    }
>>>>>>> origin/master
                ],
                posts: {
                    id: true
                }
            }

            apply_where_connected_macro(global_test_schema, query, {})

            // @ts-ignore
            expect(query.posts.$where).to.equal(undefined)
        })
        test('handles no $where_connected', () => {
            const query = {}
            apply_where_connected_macro(global_test_schema, query, {})
            expect(query).to.deep.equal({})
        })
    })
    describe(restrict_where_connected.name, () => {
        test('defaults to the restriction', () => {
            const query = {}
            const restrictions = [
<<<<<<< HEAD
                { $table: 'posts', $column: 'id', $values: [1, 2] },
=======
                { $entity: 'posts', $field: 'id', $values: [1, 2] }
>>>>>>> origin/master
            ]
            const errors = restrict_where_connected(query, restrictions)

            expect(errors).to.deep.equal([])
            //@ts-ignore
            expect(query.$where_connected).to.deep.equal(restrictions)
        })
        test('generates an error if values are not in the restriction', () => {
            const query = {
                $where_connected: [
<<<<<<< HEAD
                    { $table: 'posts', $column: 'id', $values: [1, 3] },
                ],
            }
            const restrictions = [
                { $table: 'posts', $column: 'id', $values: [1, 2] },
=======
                    { $entity: 'posts', $field: 'id', $values: [1, 3] }
                ]
            }
            const restrictions = [
                { $entity: 'posts', $field: 'id', $values: [1, 2] }
>>>>>>> origin/master
            ]
            const input_query = clone(query)
            const errors = restrict_where_connected(input_query, restrictions)

            expect(input_query).to.deep.equal(query) // shouldnt mutate the query
            expect(errors.length).to.equal(1)
        })
        test('ignores where connecteds not in the restriction', () => {
            const query = {
                $where_connected: [
                    {
<<<<<<< HEAD
                        // this one is ignored since the $column is different to the restriction
                        $table: 'posts',
                        $column: 'user_id',
                        $values: [5],
                    },
                    {
                        $table: 'posts',
                        $column: 'id',
                        $values: [1],
                    },
                ],
            }
            const restrictions = [
                { $table: 'posts', $column: 'id', $values: [1, 2] },
=======
                        // this one is ignored since the $field is different to the restriction
                        $entity: 'posts',
                        $field: 'user_id',
                        $values: [5]
                    },
                    {
                        $entity: 'posts',
                        $field: 'id',
                        $values: [1]
                    }
                ]
            }
            const restrictions = [
                { $entity: 'posts', $field: 'id', $values: [1, 2] }
>>>>>>> origin/master
            ]
            const input_query = clone(query)
            const errors = restrict_where_connected(input_query, restrictions)

            expect(input_query).to.deep.equal(query) // shouldnt mutate the query
            expect(errors).to.deep.equal([])
        })
    })
    test.skip('handles nullalbe foreign keys')
    test.skip(
        'considered yours if it belongs to multiple vendors including you (e.g. you can view an order even though other vendors oreder itesm are inside)'
    )
})
