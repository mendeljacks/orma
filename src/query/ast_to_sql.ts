/**
 * This file implements a simple json syntax which maps to standard sql queries.
 *
 * For example the json object
 *
 * {
 *   select: ['column1', 'column2'],
 *   from: 'my_table',
 *   limit: 1,
 *   where: {
 *     in: ['id', [1, 2, 3]]
 *   }
 * }
 *
 * maps to the sql statement
 *
 * SELECT column1, column2 FROM my_table WHERE id IN (1, 2, 3) LIMIT 1
 *
 * Every sql statement has a corresponding json object, and every json object has a corresponding sql
 * statement - in other words, the set of sql statements and the set of sql jsons are equivalent sets.
 * This is true theoretically, however some sql functions may not be implemented due to time limitations.
 *
 * @module ast_to_sql
 */

import { deep_get, drop_last, is_simple_object } from '../helpers/helpers'
import { SupportedDatabases } from '../schema/schema_types'

type Expression =
    | {
          readonly [commands: string]:
              | Expression
              | readonly Expression[]
              | undefined
      }
    | primitive

type primitive =
    | string
    | number
    | Date
    | Array<any>
    | boolean
    | null
    | undefined

export const json_to_sql = (
    expression: Expression,
    database_type: SupportedDatabases | undefined = undefined,
    path: any[] = [],
    original_expression: any = undefined
) => {
    if (Array.isArray(expression)) {
        return expression.map((el, i) =>
            json_to_sql(
                el,
                database_type,
                [...path, i],
                original_expression ?? expression
            )
        )
    }

    // strings and other non-objects are returned as-is
    const is_object = is_simple_object(expression)
    if (!is_object) {
        return expression
    }

    // sql commands are ordered but json keys are not, so we have to sort the keys
    const command_order =
        database_type === 'sqlite' ? sqlite_command_order : sql_command_order
    const sorted_commands = Object.keys(expression).sort(
        (command1, command2) => {
            const i1 = command_order[command1] || -1
            const i2 = command_order[command2] || -1
            return i1 - i2
        }
    )

    const parsed_commands = sorted_commands
        .map(command => {
            if (expression[command] === undefined) {
                return ''
            }

            const command_parser = sql_command_parsers[command]
            // commands must start with $, so we can safely ignore any other commands, for instance nested subqueries
            if (!command_parser) {
                // if (command[0] === '$') {
                //     throw new Error(`Cannot find command parser for ${command}.`)
                // } else {
                //     return ''
                // }

                // some commands need to be left in the statement for later use, so we just ignore them
                // (e.g. $foreign_key is needed by the nester which runs after the sql statement is executed)
                return ''
            }

            const args = expression[command]
            const parsed_args = json_to_sql(
                args,
                database_type,
                [...path, command],
                original_expression ?? expression
            )

            // Array.isArray(args)
            //     ? args.map((arg, i) =>
            //           json_to_sql(
            //               arg,
            //               database_type,
            //               [...path, command, i],
            //               original_expression ?? expression
            //           )
            //       )
            //     : json_to_sql(
            //           args,
            //           database_type,
            //           [...path, command],
            //           original_expression ?? expression
            //       )

            return command_parser(
                parsed_args,
                [...path, command],
                original_expression ?? expression,
                database_type
            )
        })
        .filter(el => el !== '')

    return parsed_commands.join(' ')
}

// const command_order_array = [
//     '$delete_from',
//     '$update',
//     '$set',
//     '$select',
//     '$from',
//     '$where',
//     '$group_by',
//     '$having',
//     '$order_by',
//     '$limit',
//     '$offset',
//     '$insert_into',
//     '$values',
// ]

type SqlFunctionDefinitions = {
    [function_name: string]: {
        ast_to_sql: (args: any, path: any) => string
        aggregate?: boolean
        allow_star?: boolean
        allow_distinct?: boolean
        min_args?: number
        max_args?: number
    }
}
export const sql_function_definitions = {
    // aggregate functions
    $cast_signed: {
        ast_to_sql: args => `CAST((${args}) AS SIGNED)`,
        min_args: 1,
        max_args: 1
    },
    $sum: {
        ast_to_sql: args => `SUM(${wrap_if_subquery(args)})`,
        aggregate: true,
        allow_distinct: true,
        min_args: 1,
        max_args: 1
    },
    $min: {
        ast_to_sql: args => `MIN(${wrap_if_subquery(args)})`,
        aggregate: true,
        allow_distinct: true,
        min_args: 1,
        max_args: 1
    },
    $max: {
        ast_to_sql: args => `MAX(${wrap_if_subquery(args)})`,
        aggregate: true,
        allow_distinct: true,
        min_args: 1,
        max_args: 1
    },
    $avg: {
        ast_to_sql: args => `AVG(${wrap_if_subquery(args)})`,
        aggregate: true,
        allow_distinct: true,
        min_args: 1,
        max_args: 1
    },
    $count: {
        ast_to_sql: args => `COUNT(${wrap_if_subquery(args)})`,
        aggregate: true,
        allow_distinct: true,
        allow_star: true,
        min_args: 1,
        max_args: 1
    },
    // non-aggregate functions
    $coalesce: {
        ast_to_sql: (args, path) => {
            const res = `COALESCE(${args.map(arg => wrap_if_subquery(arg)).join(', ')})`
            return nested_under_odd_nots(path) ? `NOT (${res})` : res
        },
        min_args: 1
    },
    $round: {
        ast_to_sql: args => `ROUND(${args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        min_args: 2,
        max_args: 2
    },
    $floor: {
        ast_to_sql: args => `FLOOR(${wrap_if_subquery(args)})`,
        min_args: 1,
        max_args: 1
    },
    $ceil: {
        ast_to_sql: args => `CEIL(${wrap_if_subquery(args)})`,
        min_args: 1,
        max_args: 1
    },
    $lower: {
        ast_to_sql: args => `LOWER(${wrap_if_subquery(args)})`,
        min_args: 1,
        max_args: 1
    },
    $upper: {
        ast_to_sql: args => `UPPER(${wrap_if_subquery(args)})`,
        min_args: 1,
        max_args: 1
    },
    $date: {
        ast_to_sql: args => `DATE(${wrap_if_subquery(args)})`,
        min_args: 1,
        max_args: 1
    },
    $if: {
        ast_to_sql: args => `IF(${args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        min_args: 3,
        max_args: 3
    },
    $concat: {
        ast_to_sql: args => `CONCAT(${args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        min_args: 1
    },
    $group_concat: {
        ast_to_sql: args => `GROUP_CONCAT(${args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        aggregate: true,
        min_args: 1
    },
    $multiply: {
        ast_to_sql: args => `(${args.map(arg => wrap_if_subquery(arg)).join(' * ')})`,
        min_args: 2,
        max_args: 2
    },
    $divide: {
        ast_to_sql: args => `(${args.map(arg => wrap_if_subquery(arg)).join(' / ')})`,
        min_args: 2,
        max_args: 2
    },
    $add: {
        ast_to_sql: args => `(${args.map(arg => wrap_if_subquery(arg)).join(' + ')})`,
        min_args: 2,
        max_args: 2
    },
    $subtract: {
        ast_to_sql: args => `(${args.map(arg => wrap_if_subquery(arg)).join(' - ')})`,
        min_args: 2,
        max_args: 2
    },
    // Postgres's PostGIS functions
    $st_distance: {
        ast_to_sql: args => `ST_Distance(${args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        min_args: 2,
        max_args: 3
    },
    $st_dwithin: {
        ast_to_sql: args => `ST_DWithin(${args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        min_args: 2,
        max_args: 3
    },
    $current_timestamp: {
        ast_to_sql: arg => `CURRENT_TIMESTAMP`,
        max_args: 0
    }
} as const satisfies SqlFunctionDefinitions

// note that the order of the command parsers is the same order they appear in the sql strings. this means that
// changing the order of the command parsers can break the output sql
const sql_command_parsers = {
    // mutations
    // table_name === true is for FOR UPDATE statements
    $update: table_name => `UPDATE ${table_name === true ? '' : table_name}`,
    $set: items =>
        `SET ${items
            .map(([column, value]) => `${column} = ${value}`)
            .join(', ')}`,
    $delete_from: table_name => `DELETE FROM ${table_name}`,
    $distinct: column_name => `DISTINCT (${column_name})`,
    $insert_into: ([table_name, [...columns]]) =>
        `INSERT INTO ${table_name} (${columns.join(', ')})`,
    $values: (values: any[][]) =>
        `VALUES ${values
            .map(inner_values => `(${inner_values.join(', ')})`)
            .join(', ')}`,

    // DML commands
    $select: args => `SELECT ${args.join(', ')}`,
    $as: args => `${wrap_if_subquery(args[0])} AS ${args[1]}`,
    $table: (args, path, obj, database_type) =>
        `${escape_column(args, database_type)}`,
    $column: (args, path, obj, database_type) =>
        `.${escape_column(args, database_type)}`,
    $from: (args, path, obj, database_type) =>
        `FROM ${escape_column(args, database_type)}`,
    $where: args => `WHERE ${args}`,
    $group_by: args => `GROUP BY ${args.join(', ')}`,
    $having: args => `HAVING ${args}`,
    $order_by: args => `ORDER BY ${args.join(', ')}`,
    $for: (args, path, obj, database_type) =>
        // sqlite doesnt support SELECT ... FOR UPDATE
        database_type === 'sqlite' ? '' : `FOR ${args}`,
    $share: args => `SHARE ${args}`,
    $of: args => `OF ${args.join(', ')}`,
    $no_wait: args => `NOWAIT ${args}`,
    $skip_locked: args => `SKIP LOCKED ${args}`,
    $asc: args => `${args} ASC`,
    $desc: args => `${args} DESC`,
    $limit: args => `LIMIT ${args}`,
    $offset: args => `OFFSET ${args}`,
    $in: (args, path) => {
        const [left_arg, right_arg] = args
        const left_arg_string = Array.isArray(left_arg)
            ? `(${left_arg.map(val => `${wrap_if_subquery(val)}`).join(', ')})`
            : left_arg
        const not_string = nested_under_odd_nots(path) ? ' NOT' : ''
        const right_arg_string = Array.isArray(right_arg)
            ? right_arg
                  .map(val =>
                      Array.isArray(val)
                          ? `(${val
                                .map(el => wrap_if_subquery(el))
                                .join(', ')})`
                          : wrap_if_subquery(val)
                  )
                  .join(', ')
            : right_arg

        return `${wrap_if_subquery(
            left_arg_string
        )}${not_string} IN (${right_arg_string})`
    },
    $and: (args, path) => {
        const res = `(${args.join(') AND (')})`
        return nested_under_odd_nots(path) ? `NOT (${res})` : res
    },
    $or: (args, path) => {
        const res = `(${args.join(') OR (')})`
        return nested_under_odd_nots(path) ? `NOT (${res})` : res
    },
    $any: args => `ANY (${args})`,
    $all: args => `ALL (${args})`,
    $eq: (args, path) => {
        const simple_eq = (left_val, right_val) =>
            is_sql_null(right_val)
                ? `${wrap_if_subquery(left_val)} IS${
                      nested_under_odd_nots(path) ? ' NOT' : ''
                  } NULL`
                : `${wrap_if_subquery(left_val)} ${
                      nested_under_odd_nots(path) ? '!' : ''
                  }= ${wrap_if_subquery(right_val)}`

        const [left_arg, right_arg] = args
        // tuple equality, e.g. (id, parent_id) = (1, 2)
        if (Array.isArray(left_arg)) {
            // if there are any nulls, we must unwrap the eq into ands
            // because sql equality doesnt work with nulls
            if (left_arg.some(is_sql_null) || right_arg.some(is_sql_null)) {
                return left_arg
                    .map((_, i) => `(${simple_eq(left_arg[i], right_arg[i])})`)
                    .join(' AND ')
            } else {
                return `(${left_arg
                    .map(val => wrap_if_subquery(val))
                    .join(', ')}) ${
                    nested_under_odd_nots(path) ? '!' : ''
                }= (${right_arg.map(val => wrap_if_subquery(val)).join(', ')})`
            }
        }

        // reqular equality, e.g. (id) = (1)
        return simple_eq(left_arg, right_arg)
    },
    $gt: (args, path) =>
        `${wrap_if_subquery(args[0])} ${
            nested_under_odd_nots(path) ? '<=' : '>'
        } ${wrap_if_subquery(args[1])}`,
    $lt: (args, path) =>
        `${wrap_if_subquery(args[0])} ${
            nested_under_odd_nots(path) ? '>=' : '<'
        } ${wrap_if_subquery(args[1])}`,
    $gte: (args, path) =>
        `${wrap_if_subquery(args[0])} ${
            nested_under_odd_nots(path) ? '<' : '>='
        } ${wrap_if_subquery(args[1])}`,
    $lte: (args, path) =>
        `${wrap_if_subquery(args[0])} ${
            nested_under_odd_nots(path) ? '>' : '<='
        } ${wrap_if_subquery(args[1])}`,
    $exists: (args, path) =>
        `${nested_under_odd_nots(path) ? 'NOT ' : ''}EXISTS (${args})`,
    $like: (args, path) => {
        // const string_arg = args[1].toString()
        // const search_value = string_arg.replace(/^\'/, '').replace(/\'$/, '') // get rid of quotes if they were put there by escape()
        // return `${args[0]}${
        // nested_under_odd_nots(path) ? ' NOT' : ''
        // } LIKE '%${search_value}%'`
        return `${wrap_if_subquery(args[0])}${
            nested_under_odd_nots(path) ? ' NOT' : ''
        } LIKE ${wrap_if_subquery(args[1])}`
    },
    $not: args => args, // not logic is different depending on the children, so the children handle it

    // SQL functions
    ...Object.keys(sql_function_definitions).reduce((acc, key) => {
        acc[key] = sql_function_definitions[key].ast_to_sql
        return acc
    }, {}),

    // DDL commands
    $create_table: (table_name, path, obj) =>
        `CREATE${
            get_neighbour_column(obj, path, '$temporary') ? ' TEMPORARY' : ''
        } TABLE${
            get_neighbour_column(obj, path, '$if_not_exists')
                ? ' IF NOT EXISTS'
                : ''
        } ${table_name}`,
    $if_not_exists: _ => '',
    $temporary: _ => '',
    $like_table: table_name => `LIKE ${table_name}`,
    $alter_table: (table_name, path, obj, database_type) =>
        `ALTER TABLE ${escape_column(table_name, database_type)}`,
    // definitions
    $definitions: args => (args?.length ? `(${args.join(', ')})` : ''),
    $alter_operation: arg => arg?.toUpperCase(),
    $old_name: (arg, path, obj) =>
        get_neighbour_column(obj, path, '$alter_operation') === 'rename'
            ? `${arg} TO`
            : arg,
    // column definition commands
    $constraint: (arg, path, obj, database_type) => {
        const name = get_neighbour_column(obj, path, '$name')
        const constraint_type_sql = {
            unique_key: `UNIQUE`,
            primary_key: `PRIMARY KEY`,
            foreign_key: `FOREIGN KEY`
        }[arg]

        const constraint_sql = name
            ? `CONSTRAINT ${escape_column(name, database_type)} `
            : ''
        return `${constraint_sql}${constraint_type_sql}`
    },
    $index: (arg, path, obj, database_type) => {
        return {
            true: `INDEX`,
            full_text: 'FULLTEXT INDEX',
            spatial: 'SPATIAL INDEX'
        }[arg]
    },
    $name: (arg, path, obj, database_type) =>
        // for constraints, name is handled differently because it goes between CONSTRAINT
        // and the constraint type (e.g. FOREIGN KEY)
        get_neighbour_column(obj, path, '$constraint')
            ? ''
            : escape_column(arg, database_type),
    $data_type: (arg, path, obj, database_type) => {
        const precision = get_neighbour_column(obj, path, '$precision')
        const scale = get_neighbour_column(obj, path, '$scale')
        const enum_values = get_neighbour_column(obj, path, '$enum_values')?.map(
            el => (database_type === 'postgres' ? `'${el}'` : `"${el}"`)
        )
        const data_type_args = (enum_values ?? [precision, scale])
            .filter(el => el !== undefined)
            .join(', ')

        // sqlite doesnt support enums directly, so it needs to be through a CHECK constraint
        if (['postgres', 'sqlite'].includes(database_type) && arg === 'enum') {
            const column_name = get_neighbour_column(obj, path, '$name')
            return `TEXT CHECK(${column_name} IN (${data_type_args}))`
        }

        // sqlite actually allows INT as a type, but then primary key
        // auto increment breaks, so we use INTEGER instead
        if (database_type === 'sqlite' && arg === 'int') {
            return `INTEGER ${data_type_args ? `(${data_type_args})` : ''}`
        }

        if (database_type === 'postgres' && arg === 'int') {
            return `INT`
        }

        return `${arg?.toUpperCase()}${
            data_type_args ? `(${data_type_args})` : ''
        }`
    },
    $unsigned: (arg, path, obj, database_type) => {
        if (arg && database_type === 'postgres') {
            const definition = deep_get([...drop_last(1, path)], obj, undefined)
            return `CHECK (${definition.$name} >= 0)`
        }

        return arg ? 'UNSIGNED' : ''
    },
    $precision: arg => '',
    $scale: arg => '',
    $enum_values: arg => ``,
    $not_null: arg => (arg ? 'NOT NULL' : ''),
    $default: arg => `DEFAULT ${arg}`,
    $auto_increment: (arg, path, obj, database_type) => {
        if (database_type === 'postgres') {
            return 'GENERATED BY DEFAULT AS IDENTITY'
        }

        if (!arg) {
            return ''
        }

        // Sqlite needs the magic INTEGER PRIMARY KEY type to do auto incrementing,
        // so we parse $auto_incrementing as an inline PRIMARY KEY constraint
        return database_type === 'sqlite' ? 'PRIMARY KEY' : 'AUTO_INCREMENT'
    },
    // index
    $columns: args => `(${args.join(', ')})`,
    $invisible: (arg, path, obj, database_type: SupportedDatabases) =>
        // sqlite doesnt support invisible indexes
        arg && database_type !== 'sqlite' ? `INVISIBLE` : '',
    $comment: (arg, path, obj, database_type: SupportedDatabases) =>
        // sqlite doesnt support the COMMENT keyword
        ['sqlite', 'postgres'].includes(database_type)
            ? ''
            : `COMMENT "${arg}"`,
    // constraint
    $references: arg => `REFERENCES ${arg}`,
    $on_delete: arg => `ON DELETE ${arg}`,
    $on_update: arg => `ON UPDATE ${arg}`,
    $restrict: arg => (arg ? `RESTRICT` : ''),
    $cascade: arg => (arg ? `CASCADE` : ''),
    $set_null: arg => (arg ? `SET NULL` : ''),
    $no_action: arg => (arg ? `NO ACTION` : ''),
    // this is just here for sqlite compatibility. It is purposefully not included in the types
    // because no one should be using such a bad and inconsistent syntax
    $create_index: (arg, path, obj, database_type) =>
        `CREATE INDEX ${escape_column(arg, database_type)}`,
    $on: arg => `ON ${arg}`
}

/**
 * Only wrap SELECT ... statments with (), since sqlite doesnt support wrapping primitive values like
 * numbers in (), I think its interpreting them as tuples when you do that
 */
const wrap_if_subquery = (val: string) =>
    val?.startsWith?.('SELECT') ? `(${val})` : val

const escape_column = (val, database_type: SupportedDatabases) => {
    if (typeof val !== 'string') {
        return val
    }
    if (['*'].includes(val)) {
        return val
    }

    return database_type === 'postgres' ? `"${val}"` : `\`${val}\``
}

const is_sql_null = val => {
    const is_regular_null = val === null
    const is_string_null = val?.toLowerCase?.() === 'null'
    return is_regular_null || is_string_null
}

const command_parser_keys = Object.keys(sql_command_parsers)
const sql_command_order = command_parser_keys.reduce((acc, val, i) => {
    acc[val] = i
    return acc
}, {})

const sqlite_command_order = command_parser_keys.reduce((acc, val, i) => {
    if (val === '$unsigned') {
        acc[val] = command_parser_keys.findIndex(el => el === '$data_type')
    } else if (val === '$data_type') {
        acc[val] = command_parser_keys.findIndex(el => el === '$unsigned')
    } else {
        acc[val] = i
    }
    return acc
}, {})

const get_neighbour_column = (obj, path, neighbour_column) => {
    const res = deep_get(
        [...drop_last(1, path), neighbour_column],
        obj,
        undefined
    )
    return res
}

/**
 * Returns true if the path ends in an odd number of $not. So ['a', '$not', '$eq'] returns true
 * but ['a', '$not', '$not', '$eq'] returns false. ignores the last element.
 */
const nested_under_odd_nots = (path: any[]) => {
    let not_count = 0
    for (let i = 0; i < path.length - 1; i++) {
        const path_element = path[path.length - 2 - i]
        if (path_element === '$not') {
            not_count += 1
        } else {
            break
        }
    }

    const is_odd = not_count % 2 === 1
    return is_odd
}

/*
 
{
    $create_table: {
        $table_name: 'test',
        // table level props
        $table_columns: [
            ['col1', {
                column level props
            }]
        ]
    }
}


{
    $create_table: 'my_table',
    $temporary: true,
    $if_not_exists: true,
    $columns: [{
        // column_definition
    }]
    $like: 'my_other_table',
    $create_as: { 
        $select: ['col'], 
        $from:'my_other_table'
    },
    $ignore: true, // xor with replace
    $replace: true,
    // table options
    $autoextend_size: 0,
    $auto_increment: 1,
    $avg_row_length: 100,
    $character_set: 'DEFAULT',
    $checksum: 1,
    $comment: 'My table',
    $compression: 'Zlib',
    $connection: '',
    $data_directory: '...',
    $index_directory: '...',
    $delay_key_write: 1,
    $encryption: 'Y',
    $engine_attribute: '',
    $secondary_engine_attribute: '',
    $insert_method: 'FIRST',
    $key_block_size: 64,
    $max_rows: 1000,
    $min_rows: 500,
    $pack_keys: 'DEFAULT',
    $row_format: '',
    $stats_auto_recalc: 0,
    $states_persistent
}

// column definition
{
    $data_type: ['decimal', 6, 2], // check sql docs page to make sure we have everything for data type
    $not_null: true,
    $default: 123,
    $invisible: true,
    $auto_increment: true,
    $comment: 'my column',
    $collate: 'utf8_bin',
    $generated_always_as: 'SQRT(col1)',
    $stored: true
}

// index definition
{
    $index: 'my_index',
    $unique: true,
    $full_text: true,
    $spatial: true,
    $invisible: true,
    $comment: 'asd',
    $columns: ['item_id', 'category_id']
}

// foreign key

 */
