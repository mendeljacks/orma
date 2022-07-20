import { expect } from 'chai'
import { describe, test } from 'mocha'
import { type } from '../helpers/helpers'
import {
    generate_field_schema,
    generate_database_schema,
    get_introspect_sqls,
    mysql_column,
    mysql_foreign_key,
    mysql_table,
    mysql_index,
    generate_index_schemas,
} from './introspector'

describe('introspector', () => {
    test('introspect sqls are string', () => {
        const introspect_sqls = get_introspect_sqls('international', 'mysql')

        expect(introspect_sqls.length).to.equal(4)
        expect(type(introspect_sqls[0])).to.equal('String')
    })

    test('primary key field schema', () => {
        const mysql_column: mysql_column = {
            table_name: 'users',
            column_name: 'id',
            ordinal_position: 1,
            is_nullable: 'YES',
            data_type: 'int',
            column_key: 'PRI',
            extra: 'auto_increment',
        }
        const field_schema = generate_field_schema(mysql_column)

        expect(field_schema).to.deep.equal({
            data_type: 'int',
            auto_increment: true,
            indexed: true,
            ordinal_position: 1,
            primary_key: true,
        })
    })

    test('unique key field schema', () => {
        const mysql_column: mysql_column = {
            table_name: 'users',
            column_name: 'username',
            ordinal_position: 2,
            is_nullable: 'NO',
            data_type: 'varchar',
            column_key: 'UNI',
        }
        const field_schema = generate_field_schema(mysql_column)

        expect(field_schema).to.deep.equal({
            data_type: 'varchar',
            not_null: true,
            indexed: true,
            ordinal_position: 2,
        })
    })

    test('decimal precision field schema', () => {
        const mysql_column: mysql_column = {
            table_name: 'users',
            column_name: 'rating',
            ordinal_position: 3,
            data_type: 'decimal',
            numeric_precision: 4,
            numeric_scale: 1,
            column_default: 1.5,
        }
        const field_schema = generate_field_schema(mysql_column)

        expect(field_schema).to.deep.equal({
            data_type: 'decimal',
            ordinal_position: 3,
            character_count: 4,
            decimal_places: 1,
            default: 1.5,
        })
    })

    test('full schema test', () => {
        const mysql_tables: mysql_table[] = [
            {
                table_name: 'users',
                table_comment: 'table of users',
            },
            {
                table_name: 'posts',
                table_comment: 'user posts',
            },
        ]

        const mysql_columns: mysql_column[] = [
            {
                table_name: 'users',
                column_name: 'id',
                ordinal_position: 1,
                data_type: 'int',
            },
            {
                table_name: 'posts',
                column_name: 'user_id',
                ordinal_position: 1,
                data_type: 'int',
            },
        ]

        const mysql_foreign_keys: mysql_foreign_key[] = [
            {
                table_name: 'posts',
                column_name: 'user_id',
                referenced_table_name: 'users',
                referenced_column_name: 'id',
                constraint_name: 'user_post_constraint',
            },
        ]

        const mysql_indexes: mysql_index[] = [
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
            mysql_indexes
        )

        expect(database_schema).to.deep.equal({
            posts: {
                $comment: 'user posts',
                user_id: {
                    data_type: 'int',
                    ordinal_position: 1,
                    references: {
                        users: {
                            id: {},
                        },
                    },
                },
            },
            users: {
                $comment: 'table of users',
                id: {
                    data_type: 'int',
                    ordinal_position: 1,
                },
                $indexes: [
                    {
                        index_name: 'simple_index',
                        is_unique: false,
                        fields: ['id'],
                        index_type: 'BTREE',
                        invisible: false,
                        collation: 'A',
                        sub_part: 1,
                        index_comment: 'my index',
                    },
                ],
            },
        })
    })
    test('generates index schemas', () => {
        const mysql_indexes: mysql_index[] = [
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
            {
                // different table
                table_name: 'posts',
                non_unique: 0,
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

        const index_schemas_by_table = generate_index_schemas(mysql_indexes)

        expect(index_schemas_by_table).to.deep.equal({
            users: [
                {
                    index_name: 'simple_index',
                    is_unique: false,
                    fields: ['id'],
                    index_type: 'BTREE',
                    invisible: false,
                    collation: 'A',
                    sub_part: 1,
                    index_comment: 'my index',
                },
                {
                    index_name: 'combo_unique',
                    is_unique: true,
                    fields: ['last_name', 'first_name'],
                    index_type: 'BTREE',
                    invisible: false,
                    collation: 'A',
                },
            ],
            posts: [
                {
                    index_name: 'posts_index',
                    is_unique: true,
                    fields: ['title'],
                    index_type: 'BTREE',
                    invisible: true,
                    collation: 'A',
                },
            ],
        })
    })
})
