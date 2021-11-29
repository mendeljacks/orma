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

import { is_simple_object, last } from '../helpers/helpers'


type expression =
    | {
        [commands: string]: expression | expression[]
    }
    | primitive

type primitive = string | number | Date | Array<any>


export const json_to_sql = (expression: expression, path = []) => {
    // strings and other non-objects are returned as-is
    const is_object = is_simple_object(expression)
    if (!is_object) {
        return expression
    }

    // sql commands are ordered but json keys are not, so we have to sort the keys
    const sorted_commands = Object.keys(expression).sort((command1, command2) => {
        // commands not in the ordering array will go at the beginning of the sql statement
        const i1 = command_order[command1] || -1
        const i2 = command_order[command2] || -1
        return i1 - i2
    })

    const parsed_commands = sorted_commands
        .map(command => {
            if (expression[command] === undefined) {
                return ''
            }

            const command_parser = sql_command_parsers[command]
            if (!command_parser) {
                throw new Error(`Cannot find command parser for ${command}.`)
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
    '$values'
]

// turn the array into an object for fast lookups
const command_order = command_order_array.reduce((acc, val, i) => {
    acc[val] = i
    return acc
}, {})

const sql_command_parsers = {
    $select: args => `SELECT ${args.join(', ')}`,
    $as: args => `(${args[0]}) AS ${args[1]}`,
    $from: args => `FROM ${args}`,
    $where: args => `WHERE ${args}`,
    $having: args => `HAVING ${args}`,
    $in: (args, path) => `${args[0]}${last(path) === '$not' ? ' NOT' : ''} IN (${args[1]})`,
    $group_by: args => `GROUP BY ${args.join(', ')}`,
    $order_by: args => `ORDER BY ${args.join(', ')}`,
    $asc: args => `${args} ASC`,
    $desc: args => `${args} DESC`,
    $and: (args, path) => {
        const res = `(${args.join(') AND (')})`
        return last(path) === '$not' ? `NOT (${res})` : res
    },
    $or: (args, path) => {
        const res = `(${args.join(') OR (')})`
        return last(path) === '$not' ? `NOT (${res})` : res
    },
    $any: args => `ANY (${args})`,
    $all: args => `ALL (${args})`,
    $eq: (args, path) =>
        args[1] === null
            ? `${args[0]}${last(path) === '$not' ? ' NOT' : ''} IS NULL`
            : `${args[0]} ${last(path) === '$not' ? '!' : ''}= ${args[1]}`,
    $gt: (args, path) => `${args[0]} ${last(path) === '$not' ? '<=' : '>'} ${args[1]}`,
    $lt: (args, path) => `${args[0]} ${last(path) === '$not' ? '>=' : '<'} ${args[1]}`,
    $gte: (args, path) => `${args[0]} ${last(path) === '$not' ? '<' : '>='} ${args[1]}`,
    $lte: (args, path) => `${args[0]} ${last(path) === '$not' ? '>' : '<='} ${args[1]}`,
    $exists: (args, path) => `${last(path) === '$not' ? 'NOT ' : ''}EXISTS (${args})`,
    $limit: args => `LIMIT ${args}`,
    $offset: args => `OFFSET ${args}`,
    $like: (args, path) => {
        const string_arg = args[1].toString()
        const search_value = string_arg.replace(/^\'/, '').replace(/\'$/, '') // get rid of quotes if they were put there by escape()
        return `${args[0]}${last(path) === '$not' ? ' NOT' : ''} LIKE '%${search_value}%'`
    },
    $not: args => args, // not logic is different depending on the children, so the children handle it
    $sum: args => `SUM(${args})`,
    $insert_into: ([table_name, [...columns]]) =>
        `INSERT INTO ${table_name} (${columns.join(', ')})`,
    $values: (values: any[][]) =>
        `VALUES ${values.map(inner_values => `(${inner_values.join(', ')})`).join(', ')}`,
    $update: table_name => `UPDATE ${table_name}`,
    $set: (items) => `SET ${items.map(([column, value]) => `${column} = ${value}`).join(', ')}`,
    $delete_from: table_name => `DELETE FROM ${table_name}`
}