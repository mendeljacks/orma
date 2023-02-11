import { expect } from 'chai'
import { describe, test } from 'mocha'
import { format } from 'sql-formatter'
import { AlterStatement, CreateStatement } from '../types/schema/schema_ast_types'
import { json_to_sql } from './json_sql'

describe('query', () => {
    describe('json_to_sql', () => {
        test('joins commands', () => {
            const json = {
                $select: ['a'],
                $from: 'b',
            }

            const sql = format(json_to_sql(json))
            const goal = format(`SELECT a FROM b`)

            expect(sql).to.equal(goal)
        })
        test('nested command work', () => {
            const json = {
                $where: {
                    $eq: ['a', 'b'],
                },
            }

            const sql = format(json_to_sql(json))
            const goal = format('WHERE (a) = (b)')

            expect(sql).to.equal(goal)
        })
        test("'$not' command works", () => {
            const json = {
                $not: {
                    $in: ['a', [1, 2]],
                },
            }

            const sql = format(json_to_sql(json))
            const goal = format('a NOT IN (1, 2)')

            expect(sql).to.equal(goal)
        })
        test('$not works with null equality', () => {
            const json = {
                $and: [
                    {
                        $not: {
                            $eq: ['a', null],
                        },
                    },
                    {
                        $not: {
                            // this also evualuates to NULL when passed into sql. Sql commands are case insensitive, so
                            // the casing shouldnt matter
                            $eq: ['a', 'NuLl'],
                        },
                    },
                ],
            }

            const sql = format(json_to_sql(json))
            const goal = format('((a) IS NOT NULL) AND ((a) IS NOT NULL)')

            expect(sql).to.equal(goal)
        })
        test('handles aggregate functions', () => {
            const json = {
                $min: 'field',
                $count: '*',
            }

            const sql = format(json_to_sql(json))
            const goal = format('MIN(field) COUNT(*)')

            expect(sql).to.equal(goal)
        })
        test('handles functions with multiple args', () => {
            const json = {
                $coalesce: [1, 2],
            }

            const sql = format(json_to_sql(json))
            const goal = format('COALESCE(1, 2)')

            expect(sql).to.equal(goal)
        })
        test('$round', () => {
            const json = {
                $round: [1.234, 2],
            }

            const sql = format(json_to_sql(json))
            const goal = format('ROUND(1.234, 2)')

            expect(sql).to.equal(goal)
        })
        test('handles upper', () => {
            const json = { $upper: "'hello'" }
            const sql = format(json_to_sql(json))
            const goal = format(`UPPER('hello')`)
            expect(sql).to.equal(goal)
        })
        test('handles lower', () => {
            const json = { $lower: "'hello'" }
            const sql = format(json_to_sql(json))
            const goal = format(`LOWER('hello')`)
            expect(sql).to.equal(goal)
        })
        test('handles if', () => {
            const json = {
                $if: [{ $eq: [1, 1] }, '"yes"', '"no"'],
            }
            const sql = format(json_to_sql(json))
            const goal = format(`IF ((1) = (1), "yes", "no")`)
            expect(sql).to.equal(goal)
        })
        test('handles concat', () => {
            const json = { $concat: ['"a"', '"b"'] }
            const sql = format(json_to_sql(json))
            const goal = format(`CONCAT ("a", "b")`)
            expect(sql).to.equal(goal)
        })

        test("ignores even number of '$not' commands", () => {
            const json = {
                $not: {
                    $not: {
                        $not: {
                            $not: {
                                $in: ['a', [1, 2]],
                            },
                        },
                    },
                },
            }

            const sql = format(json_to_sql(json))
            const goal = format('a IN (1, 2)')

            expect(sql).to.equal(goal)
        })
        test('ignores undefined properties', () => {
            const json = {
                $having: undefined,
            }
            //@ts-ignore
            const sql = format(json_to_sql(json))
            const goal = format('')

            expect(sql).to.equal(goal)
        })
        test('handles $entity $field', () => {
            const json = {
                $entity: 'items',
                $field: 'sku',
            }
            //@ts-ignore
            const sql = format(json_to_sql(json))
            const goal = format('items.sku')

            expect(sql).to.equal(goal)
        })
        test('Can wrap subqueries in ()', () => {
            const json = {
                $having: {
                    $gte: [
                        {
                            $select: ['*'],
                            $from: 'reviews',
                            $where: { $eq: ['listing_id', 0] },
                        },
                        4,
                    ],
                },
            }

            const sql = format(json_to_sql(json))

            const goal = format(`
            HAVING
            (SELECT
              *
            FROM
              reviews
            WHERE
              (listing_id) = (0)) >= (4)`)

            expect(sql).to.equal(goal)
        })
        test('can create table', () => {
            const json: CreateStatement = {
                $create_table: 'my_table',
                $temporary: true,
                $if_not_exists: true,
                $comment: 'my table',
                $definitions: [
                    {
                        $name: 'id',
                        $data_type: 'int',
                        $not_null: true,
                        $auto_increment: true,
                    },
                    {
                        $constraint: 'primary_key',
                        $fields: ['id'],
                    },
                ],
            }

            const goal = format(`
                CREATE TEMPORARY TABLE IF NOT EXISTS my_table (
                    id INT NOT NULL AUTO INCREMENT,
                    CONSTRAINT PRIMARY KEY (id)
                ) COMMENT "my table"`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
        test('handles add, drop and modify field', () => {
            const json: AlterStatement = {
                $alter_table: 'my_table',
                $definitions: [
                    {
                        $alter_operation: 'add',
                        $name: 'id',
                        $data_type: 'int',
                    },
                    {
                        $alter_operation: 'drop',
                        $name: 'id',
                    },
                    {
                        $alter_operation: 'modify',
                        $old_name: 'id',
                        $name: 'my_id',
                        $data_type: 'decimal',
                        $precision: 6,
                        $scale: 2
                    },
                ],
            }

            const goal = format(`
                ALTER TABLE my_table (
                    ADD id INT,
                    DROP id,
                    MODIFY id my_id DECIMAL(6, 2)
                )`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
        test('handles auto_increment and not_null', () => {
            const json: CreateStatement = {
                $create_table: 'my_table',
                $definitions: [
                    {
                        $name: 'id',
                        $data_type: 'int',
                        $not_null: true,
                        $auto_increment: true,
                    },
                ],
            }

            const goal = format(`
                CREATE TABLE my_table (
                    id INT NOT NULL AUTO INCREMENT
                )`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
        test('handles default', () => {
            const json: CreateStatement = {
                $create_table: 'my_table',
                $definitions: [
                    {
                        $name: 'label1',
                        $data_type: 'varchar',
                        $precision: 2,
                        $default: '"N/A"',
                    },
                    {
                        $name: 'label2',
                        $data_type: 'varchar',
                        $precision: 2,
                        $default: {
                            $current_timestamp: true,
                        },
                    },
                ],
            }

            const goal = format(`
                CREATE TABLE my_table (
                    label1 VARCHAR(2) DEFAULT "N/A",
                    label2 VARCHAR(2) DEFAULT CURRENT_TIMESTAMP
                )`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
        test('handles $on_update for field', () => {
            const json: CreateStatement = {
                $create_table: 'my_table',
                $definitions: [
                    {
                        $name: 'updated_at',
                        $data_type: 'timestamp',
                        $not_null: true,
                        $default: {
                            $current_timestamp: true,
                        },
                        $on_update: {
                            $current_timestamp: true,
                        },
                    },
                ],
            }

            const goal = format(`
                CREATE TABLE my_table (
                    updated_at TIMESTAMP NOT NULL 
                        DEFAULT CURRENT_TIMESTAMP 
                        ON UPDATE CURRENT_TIMESTAMP
                )`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
        test('handles invisible index', () => {
            const json: AlterStatement = {
                $alter_table: 'my_table',
                $definitions: [
                    {
                        $alter_operation: 'add',
                        $index: true,
                        $name: 'invisible',
                        $invisible: true,
                        $fields: ['label'],
                        $comment: 'invis',
                    },
                ],
            }

            const goal = format(`
                ALTER TABLE my_table (
                    ADD INDEX invisible (label) INVISIBLE COMMENT "invis"
                )`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
        test('handles unique index', () => {
            const json: AlterStatement = {
                $alter_table: 'my_table',
                $definitions: [
                    {
                        $alter_operation: 'add',
                        $constraint: 'unique',
                        $name: 'uq_ind',
                        $fields: ['label'],
                    },
                ],
            }

            const goal = format(`
            ALTER TABLE my_table (
                ADD CONSTRAINT uq_ind UNIQUE INDEX (label)
            )`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
        test('handles fulltext with multiple fields', () => {
            const json: AlterStatement = {
                $alter_table: 'my_table',
                $definitions: [
                    {
                        $alter_operation: 'add',
                        $index: 'full_text',
                        $name: 'ft',
                        $fields: ['size', 'label'],
                    },
                ],
            }

            const goal = format(`
            ALTER TABLE my_table (
                ADD FULLTEXT INDEX ft (size, label)
            )`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
        test('handles primary key', () => {
            const json: AlterStatement = {
                $alter_table: 'my_table',
                $definitions: [
                    {
                        $alter_operation: 'add',
                        $constraint: 'primary_key',
                        $name: 'primary',
                        $fields: ['id'],
                    },
                ],
            }

            const goal = format(`
            ALTER TABLE my_table (
                ADD CONSTRAINT primary PRIMARY KEY (id)
            )`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
        test('handles foreign key', () => {
            const foreign_key_base: AlterStatement['$definitions'][number] = {
                $alter_operation: 'add',
                $constraint: 'foreign_key',
                $fields: ['parent_id'],
                $references: {
                    $entity: 'parents',
                    $fields: ['id'],
                },
            }

            const json: AlterStatement = {
                $alter_table: 'my_table',
                $definitions: [
                    foreign_key_base,
                    {
                        ...foreign_key_base,
                        $name: 'my_foreign_key',
                        $on_update: {
                            $restrict: true,
                        },
                        $on_delete: {
                            $cascade: true,
                        },
                    },
                    {
                        ...foreign_key_base,
                        $on_update: {
                            $set_null: true,
                        },
                        $on_delete: {
                            $no_action: true,
                        },
                    },
                ],
            }

            const goal = format(`
            ALTER TABLE my_table (
                ADD CONSTRAINT FOREIGN KEY (parent_id) REFERENCES parents (id),
                ADD CONSTRAINT my_foreign_key FOREIGN KEY (parent_id) REFERENCES parents (id) 
                    ON DELETE CASCADE ON UPDATE RESTRICT,
                ADD CONSTRAINT FOREIGN KEY (parent_id) REFERENCES parents (id) 
                    ON DELETE NO ACTION ON UPDATE SET NULL
            )`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
        test('can create table $like', () => {
            const json: CreateStatement = {
                $create_table: 'my_table',
                $like_table: 'other_table',
            }

            const goal = format(`
            CREATE TABLE my_table LIKE other_table`)

            expect(format(json_to_sql(json))).to.equal(goal)
        })
    })
})
