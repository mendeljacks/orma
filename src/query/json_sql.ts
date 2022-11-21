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
 * @module json_sql
 */

import { escapeId } from 'sqlstring'
import { is_simple_object } from '../helpers/helpers'

type expression =
    | {
          [commands: string]: expression | expression[]
      }
    | primitive

type primitive = string | number | Date | Array<any>

export const json_to_sql = (expression: expression, path: any[] = []) => {
    // strings and other non-objects are returned as-is
    const is_object = is_simple_object(expression)
    if (!is_object) {
        return expression
    }

    // sql commands are ordered but json keys are not, so we have to sort the keys
    const sorted_commands = Object.keys(expression).sort(
        (command1, command2) => {
            // commands not in the ordering array will go at the beginning of the sql statement
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
            const parsed_args = Array.isArray(args)
                ? args.map((arg, i) => json_to_sql(arg, [...path, command, i]))
                : json_to_sql(args, [...path, command])

            return command_parser(parsed_args, path)
        })
        .filter(el => el !== '')

    return parsed_commands.join(' ')
}

const command_order_array = [
    '$delete_from',
    '$update',
    '$set',
    '$select',
    '$from',
    '$where',
    '$group_by',
    '$having',
    '$order_by',
    '$limit',
    '$offset',
    '$insert_into',
    '$values',
]

// turn the array into an object for fast lookups
const command_order = command_order_array.reduce((acc, val, i) => {
    acc[val] = i
    return acc
}, {})

export const sql_function_definitions: {
    [function_name: string]: {
        ast_to_sql: (args: any) => string
        aggregate?: boolean
        allow_star?: boolean
        allow_distinct?: boolean
        multiple_args?: boolean
    }
} = {
    // aggregate functions
    $sum: {
        ast_to_sql: args => `SUM(${args})`,
        aggregate: true,
        allow_distinct: true,
    },
    $min: {
        ast_to_sql: args => `MIN(${args})`,
        aggregate: true,
        allow_distinct: true,
    },
    $max: {
        ast_to_sql: args => `MAX(${args})`,
        aggregate: true,
        allow_distinct: true,
    },
    $avg: {
        ast_to_sql: args => `AVG(${args})`,
        aggregate: true,
        allow_distinct: true,
    },
    $count: {
        ast_to_sql: args => `COUNT(${args})`,
        aggregate: true,
        allow_distinct: true,
        allow_star: true,
    },
    // non-aggregate functions
    $coalesce: {
        ast_to_sql: args => `COALESCE(${args.join(', ')})`,
        multiple_args: true,
    },
    $round: {
        ast_to_sql: args => `ROUND(${args.join(', ')})`,
        multiple_args: true,
    },
    $lower: {
        ast_to_sql: args => `LOWER(${args})`,
    },
    $upper: {
        ast_to_sql: args => `UPPER(${args})`,
    },
    $date: {
        ast_to_sql: args => `DATE(${args})`,
    },
    $if: {
        ast_to_sql: args => `IF(${args.join(', ')})`,
    },
    $concat: {
        ast_to_sql: args => `CONCAT(${args.join(', ')})`,
        multiple_args: true,
    },

    // Postgres's PostGIS functions
    $st_distance: {
        ast_to_sql: args => `ST_Distance(${args.join(', ')})`,
        multiple_args: true,
    },
    $st_dwithin: {
        ast_to_sql: args => `ST_DWithin(${args.join(', ')})`,
        multiple_args: true,
    },
}

const sql_command_parsers = {
    // DML commands
    $select: args => `SELECT ${args.join(', ')}`,
    $as: args => `(${args[0]}) AS ${args[1]}`,
    $entity: args => `${args}.`,
    $field: args => `${args}`,
    $from: args => `FROM ${args}`,
    $where: args => `WHERE ${args}`,
    $having: args => `HAVING ${args}`,
    $in: (args, path) =>
        `${args[0]}${nested_under_odd_nots(path) ? ' NOT' : ''} IN (${
            args[1]
        })`,
    $group_by: args => `GROUP BY ${args.join(', ')}`,
    $order_by: args => `ORDER BY ${args.join(', ')}`,
    $asc: args => `${args} ASC`,
    $desc: args => `${args} DESC`,
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
    $eq: (args, path) =>
        // handle regular null or string null
        args[1] === null ||
        (typeof args[1] === 'string' && args[1].toLowerCase() === 'null')
            ? `(${args[0]}) IS${nested_under_odd_nots(path) ? ' NOT' : ''} NULL`
            : `(${args[0]}) ${nested_under_odd_nots(path) ? '!' : ''}= (${
                  args[1]
              })`,
    $gt: (args, path) =>
        `(${args[0]}) ${nested_under_odd_nots(path) ? '<=' : '>'} (${args[1]})`,
    $lt: (args, path) =>
        `(${args[0]}) ${nested_under_odd_nots(path) ? '>=' : '<'} (${args[1]})`,
    $gte: (args, path) =>
        `(${args[0]}) ${nested_under_odd_nots(path) ? '<' : '>='} (${args[1]})`,
    $lte: (args, path) =>
        `(${args[0]}) ${nested_under_odd_nots(path) ? '>' : '<='} (${args[1]})`,
    $exists: (args, path) =>
        `${nested_under_odd_nots(path) ? 'NOT ' : ''}EXISTS (${args})`,
    $limit: args => `LIMIT ${args}`,
    $offset: args => `OFFSET ${args}`,
    $like: (args, path) => {
        // const string_arg = args[1].toString()
        // const search_value = string_arg.replace(/^\'/, '').replace(/\'$/, '') // get rid of quotes if they were put there by escape()
        // return `${args[0]}${
        // nested_under_odd_nots(path) ? ' NOT' : ''
        // } LIKE '%${search_value}%'`
        return `(${args[0]})${
            nested_under_odd_nots(path) ? ' NOT' : ''
        } LIKE (${args[1]})`
    },
    $not: args => args, // not logic is different depending on the children, so the children handle it

    // SQL functions
    ...Object.keys(sql_function_definitions).reduce((acc, key) => {
        acc[key] = sql_function_definitions[key].ast_to_sql
        return acc
    }, {}),

    // mutations
    $insert_into: ([table_name, [...columns]]) =>
        `INSERT INTO ${table_name} (${columns.join(', ')})`,
    $values: (values: any[][]) =>
        `VALUES ${values
            .map(inner_values => `(${inner_values.join(', ')})`)
            .join(', ')}`,
    $update: table_name => `UPDATE ${table_name}`,
    $set: items =>
        `SET ${items
            .map(([column, value]) => `${column} = ${value}`)
            .join(', ')}`,
    $delete_from: table_name => `DELETE FROM ${table_name}`,
    $distinct: column_name => `DISTINCT ${column_name}`,

    // DDL commands
}

/**
 * Returns true if the last n elements of a path are $not and n is odd. So ['a', '$not'] returns true
 * but ['a', '$not', '$not'] returns false
 */
const nested_under_odd_nots = (path: any[]) => {
    let not_count = 0
    for (let i = 0; i < path.length; i++) {
        const path_element = path[path.length - 1 - i]
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
        $table_fields: [
            ['col1', {
                field level props
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
    $as: { 
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



 */
