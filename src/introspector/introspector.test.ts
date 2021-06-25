import { expect } from 'chai'
import { describe, test } from 'mocha'
import { type } from '../helpers'
import { generate_field_schema, generate_database_schema, get_introspect_sqls, introspect, mysql_column, mysql_foreign_key, mysql_table } from './introspector'


describe('introspector', () => {
    test('introspect sqls are string', () => {
        const introspect_sqls = get_introspect_sqls('international')

        expect(introspect_sqls.length).to.equal(3)
        expect(type(introspect_sqls[0])).to.equal('String')
    })

    test('primary key field schema', () => {
        const mysql_column: mysql_column = {
            table_name: 'users',
            column_name: 'id',
            ordinal_position: 1,
            is_nullable: 'NO',
            data_type: 'int',
            column_key: 'PRI',
            extra: 'auto_increment'
        }
        const field_schema = generate_field_schema(mysql_column)

        expect(field_schema).to.deep.equal({
            data_type: "number",
            default: "auto_increment",
            indexed: true,
            ordinal_position: 1,
            primary_key: true,
            required: true,
            unique: true
        })
    })

    test('unique key field schema', () => {
        const mysql_column: mysql_column = {
            table_name: 'users',
            column_name: 'username',
            ordinal_position: 2,
            is_nullable: 'NO',
            data_type: 'varchar',
            column_key: 'UNI'
        }
        const field_schema = generate_field_schema(mysql_column)

        expect(field_schema).to.deep.equal({
            data_type: "string",
            indexed: true,
            ordinal_position: 2,
            required: true,
            unique: true
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
            column_default: 1.5
        }
        const field_schema = generate_field_schema(mysql_column)

        expect(field_schema).to.deep.equal({
            data_type: "number",
            ordinal_position: 3,
            character_count: 4,
            decimal_places: 1,
            default: 1.5
        })
    })

    test('entity relationships', () => {
        const mysql_tables: mysql_table[] = [{
            table_name: 'users',
            table_comment: 'table of users'
        }, {
            table_name: 'posts',
            table_comment: 'user posts'
        }]

        const mysql_columns: mysql_column[] = [{
            table_name: 'users',
            column_name: 'id',
            ordinal_position: 1,
            data_type: 'int'
        }, {
            table_name: 'posts',
            column_name: 'user_id',
            ordinal_position: 1,
            data_type: 'int'
        }]

        const mysql_foreign_keys: mysql_foreign_key[] = [{
            table_name: 'posts',
            column_name: 'user_id',
            referenced_table_name: 'users',
            referenced_column_name: 'id',
            constraint_name: 'user_post_constraint'
        }]

        const database_schema = generate_database_schema(mysql_tables, mysql_columns, mysql_foreign_keys)

        expect(database_schema).to.deep.equal({
            entities: {
                posts: {
                    comment: "user posts",
                    fields: {
                        user_id: {
                            data_type: "number",
                            ordinal_position: 1,
                            references: {
                                users: {
                                    id: {}
                                }
                            }
                        }
                    }
                },
                users: {
                    comment: "table of users",
                    fields: {
                        id: {
                            data_type: "number",
                            ordinal_position: 1
                        }
                    }
                }
            }
        })
    })
})