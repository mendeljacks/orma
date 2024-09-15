import { expect } from 'chai'
import { describe, test } from 'mocha'
import { sort_by_prop, type } from '../helpers/helpers'
import { OrmaSchema } from './schema_types'
import {
    generate_column_schema,
    generate_database_schema,
    get_introspect_sqls,
    MysqlColumn,
    MysqlForeignKey,
    MysqlTable,
    MysqlIndex,
    generate_index_schemas,
    generate_orma_schema_cache,
} from './introspector'

describe('introspector', () => {
    test('introspect sqls are string', () => {
        const introspect_sqls = get_introspect_sqls('international', 'mysql')

        expect(introspect_sqls.length).to.equal(4)
        expect(type(introspect_sqls[0])).to.equal('String')
    })
    test(sort_by_prop.name, () => {
        const arr = [{ my_prop: 'b' }, { my_prop: 'a' }]
        const sorted = [{ my_prop: 'a' }, { my_prop: 'b' }]
        const result = arr.sort((a, b) => sort_by_prop(a, b, 'my_prop'))
        expect(result).to.deep.equal(sorted)
    })
    test('primary key column schema', () => {
        const mysql_column: MysqlColumn = {
            table_name: 'users',
            column_name: 'id',
            ordinal_position: 1,
            is_nullable: 'YES',
            data_type: 'int',
            column_key: 'PRI',
            extra: 'auto_increment',
        }
        const column_schema = generate_column_schema(mysql_column)

        expect(column_schema).to.deep.equal({
            $data_type: 'int',
            $auto_increment: true,
        })
    })

    test('unique key column schema', () => {
        const mysql_column: MysqlColumn = {
            table_name: 'users',
            column_name: 'username',
            ordinal_position: 2,
            is_nullable: 'NO',
            data_type: 'varchar',
            column_key: 'UNI',
        }
        const column_schema = generate_column_schema(mysql_column)

        expect(column_schema).to.deep.equal({
            $data_type: 'varchar',
            $not_null: true,
        })
    })

    test('decimal precision column schema', () => {
        const mysql_column: MysqlColumn = {
            table_name: 'users',
            column_name: 'rating',
            ordinal_position: 3,
            data_type: 'decimal',
            numeric_precision: 4,
            numeric_scale: 1,
            column_default: 1.5,
        }
        const column_schema = generate_column_schema(mysql_column)

        expect(column_schema).to.deep.equal({
            $data_type: 'decimal',
            $precision: 4,
            $scale: 1,
            $default: 1.5,
        })
    })
    test('enum column schema', () => {
        const mysql_column: MysqlColumn = {
            table_name: 'users',
            column_name: 'username',
            ordinal_position: 2,
            column_type: "enum('running','pending','paused')",
            is_nullable: 'NO',
            data_type: 'enum',
            column_key: 'UNI',
        }
        const column_schema = generate_column_schema(mysql_column)

        expect(column_schema).to.deep.equal({
            $data_type: 'enum',
            $not_null: true,
            $enum_values: ['running', 'pending', 'paused'],
        })
    })
    test('unsigned column schema', () => {
        const mysql_column: MysqlColumn = {
            table_name: 'users',
            column_name: 'username',
            column_type: 'int(10) unsigned',
            ordinal_position: 2,
            data_type: 'int',
        }
        const column_schema = generate_column_schema(mysql_column)

        expect(column_schema).to.deep.equal({
            $data_type: 'int',
            $unsigned: true,
        })
    })

    test('full schema test', () => {
        const mysql_tables: MysqlTable[] = [
            {
                table_name: 'users',
                table_comment: 'table of users',
            },
            {
                table_name: 'posts',
                table_comment: 'user posts',
            },
        ]

        const mysql_columns: MysqlColumn[] = [
            {
                table_name: 'users',
                column_name: 'id',
                ordinal_position: 1,
                data_type: 'int',
                column_key: 'PRI',
            },
            {
                table_name: 'posts',
                column_name: 'user_id',
                ordinal_position: 1,
                data_type: 'int',
                column_key: 'PRI',
            },
        ]

        const mysql_foreign_keys: MysqlForeignKey[] = [
            {
                table_name: 'posts',
                column_name: 'user_id',
                referenced_table_name: 'users',
                referenced_column_name: 'id',
                constraint_name: 'user_post_constraint',
            },
        ]

        const mysql_indexes: MysqlIndex[] = [
            {
                // single column index
                table_name: 'users',
                non_unique: 1,
                index_name: 'simple_index',
                seq_in_index: 1,
                column_name: 'id',
                collation: 'A',
                sub_part: 1,
                packed: null,
                nullable: 'YES',
                index_type: 'BTREE',
                //@ts-ignore
                comment: null,
                index_comment: 'my index',
                is_visible: 'YES',
                //@ts-ignore
                expression: null,
            },
        ]

        const database_schema = generate_database_schema(
            mysql_tables,
            mysql_columns,
            mysql_foreign_keys,
            mysql_indexes,
            'mysql'
        )

        expect(database_schema).to.deep.equal({
            tables: {
                posts: {
                    database_type: 'mysql',
                    $comment: 'user posts',
                    columns: {
                        user_id: { $data_type: 'int' },
                    },
                    foreign_keys: [
                        {
                            $name: 'user_post_constraint',
                            $columns: ['user_id'],
                            $references: {
                                $table: 'users',
                                $columns: ['id'],
                            },
                        },
                    ],
                    primary_key: {
                        $columns: ['user_id'],
                    },
                },
                users: {
                    columns: { id: { $data_type: 'int' } },
                    $comment: 'table of users',
                    database_type: 'mysql',
                    indexes: [
                        {
                            $name: 'simple_index',
                            $columns: ['id'],
                            $comment: 'my index',
                        },
                    ],
                    primary_key: { $columns: ['id'] },
                },
            },
        } as const satisfies OrmaSchema)
    })
    test('generates index schemas', () => {
        const mysql_indexes: MysqlIndex[] = [
            {
                // single column index
                table_name: 'users',
                non_unique: 1,
                index_name: 'simple_index',
                seq_in_index: 1,
                column_name: 'id',
                collation: 'A',
                sub_part: 1,
                packed: null,
                nullable: 'YES',
                index_type: 'BTREE',
                //@ts-ignore
                comment: null,
                index_comment: 'my index',
                is_visible: 'YES',
                //@ts-ignore
                expression: null,
            },
            {
                // different table
                table_name: 'posts',
                non_unique: 1,
                index_name: 'posts_index',
                seq_in_index: 2,
                column_name: 'title',
                collation: 'A',
                sub_part: null,
                packed: null,
                nullable: '',
                index_type: 'BTREE',
                //@ts-ignore
                comment: null,
                index_comment: '',
                is_visible: 'NO',
                //@ts-ignore
                expression: null,
            },
        ]

        const index_schemas_by_table = generate_index_schemas(
            mysql_indexes,
            false
        )

        expect(index_schemas_by_table).to.deep.equal({
            users: [
                {
                    $name: 'simple_index',
                    $columns: ['id'],
                    $comment: 'my index',
                },
            ],
            posts: [
                {
                    $name: 'posts_index',
                    $columns: ['title'],
                    $invisible: true,
                },
            ],
        })
    })
    test('generates unique key schemas', () => {
        const mysql_indexes: MysqlIndex[] = [
            {
                // combo unique
                table_name: 'users',
                non_unique: 0,
                index_name: 'combo_unique',
                seq_in_index: 2,
                column_name: 'first_name',
                collation: 'A',
                sub_part: null,
                packed: null,
                nullable: '',
                index_type: 'BTREE',
                //@ts-ignore
                comment: null,
                index_comment: '',
                is_visible: 'YES',
                //@ts-ignore
                expression: null,
            },
            {
                // combo unique
                table_name: 'users',
                non_unique: 0,
                index_name: 'combo_unique',
                seq_in_index: 1,
                column_name: 'last_name',
                collation: 'A',
                sub_part: null,
                packed: null,
                nullable: '',
                index_type: 'BTREE',
                //@ts-ignore
                comment: null,
                index_comment: '',
                is_visible: 'YES',
                //@ts-ignore
                expression: null,
            },
        ]

        const index_schemas_by_table = generate_index_schemas(
            mysql_indexes,
            true
        )

        expect(index_schemas_by_table).to.deep.equal({
            users: [
                {
                    $name: 'combo_unique',
                    $columns: ['last_name', 'first_name'],
                },
            ],
        })
    })
    describe(generate_orma_schema_cache.name, () => {
        const schema = {
            tables: {
                products: {
                    columns: {
                        id: {
                            $data_type: 'int',
                        },
                    },
                    database_type: 'mysql',
                    primary_key: { $columns: ['id'] },
                },
                images: {
                    columns: { product_id: { $data_type: 'int' } },
                    database_type: 'mysql',
                    primary_key: { $columns: ['id'] },
                    foreign_keys: [
                        {
                            $columns: ['product_id'],
                            $references: {
                                $table: 'products',
                                $columns: ['id'],
                            },
                        },
                    ],
                },
            },
        } as const satisfies OrmaSchema

        const cache = generate_orma_schema_cache(schema.$tables)
        const goal = {
            $reversed_foreign_keys: {
                products: [
                    {
                        from_column: 'id',
                        to_table: 'images',
                        to_column: 'product_id',
                    },
                ],
            },
        }

        expect(cache).to.deep.equal(goal)
    })
})
