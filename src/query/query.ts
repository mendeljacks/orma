import { last } from '../helpers/helpers'

type expression = {
    [commands: string]: expression | expression[]
} | primitive

type primitive = string | number | Date | Array<any>


// this is a simple parser function, whatever comes in the json object is placed as-is in the output sql string.
// more complicated rules (such as adding a 'from' clause, or adding group-by columns on select *) is handled while the query is still a json object
export const json_to_sql = (expression: expression, path=[]) => {
    // strings and other non-objects are returned as-is
    const is_object = typeof expression === 'object' && !Array.isArray(expression)
    if (!is_object) {
        return expression
    }

    const sorted_commands = Object.keys(expression).sort((command1, command2) => {
        // unspecified commands go at the beginning
        const i1 = command_order[command1] || -1
        const i2 = command_order[command2] || -1
        return i1 - i2
    })

    const parsed_commands = sorted_commands.map(command => {
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

    return parsed_commands.join(' ')
}

const command_order = { 
    $select: 0,
    $from: 1,
    $where: 2,
    $group_by: 3,
    $having: 4,
    $order_by: 5,
    $limit: 6,
    $offset: 7
}

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
    $and: args => `(${args.join(') AND (')})`,
    $or: args => `(${args.join(') OR (')})`,
    $eq: (args, path) => args[1] === null 
    ? `${args[0]}${last(path) === '$not' ? ' NOT' : ''} IS NULL` 
    : `${args[0]} ${last(path) === '$not' ? '!' : ''}= ${args[1]}`,
    $gt: (args, path) => `${args[0]} ${last(path) === '$not' ? '<=' : '>'} ${args[1]}`,
    $lt: (args, path) => `${args[0]} ${last(path) === '$not' ? '>=' : '<'} ${args[1]}`,
    $gte: (args, path) => `${args[0]} ${last(path) === '$not' ? '<' : '>='} ${args[1]}`,
    $lte: (args, path) => `${args[0]} ${last(path) === '$not' ? '>' : '<='} ${args[1]}`,
    $exists: (args, path) => `${last(path) === '$not' ? 'NOT ' : ''}EXISTS (${args})`,
    $limit: args => `LIMIT ${args}`,
    $offset: args => `OFFSET ${args}`,
    $like: args => {
        const string_arg = args[1].toString()
        const search_value = string_arg
        .replace(/^\'/, '')
        .replace(/\'$/, '') // get rid of quotes if they were put there by escape()
        return `${args[0]} LIKE '%${search_value}%'`
    },
    $not: args => `NOT (${args})`,
    $sum: args => `SUM(${args}) AS sum_${args}`,
    // not: {
    //     in: args => `${args[0]} NOT IN (${args[1]})`,
    //     and: args => `NOT ((${args.join(') AND (')}))`,
    //     or: args => `NOT ((${args.join(') OR (')}))`,
    //     eq: args => args[1] === null ? `${args[0]} IS NOT NULL` : `${args[0]} != ${args[1]}`,
    //     gt: args => `${args[0]} <= ${args[1]}`,
    //     lt: args => `${args[0]} >= ${args[1]}`,
    //     gte: args => `${args[0]} < ${args[1]}`,
    //     lte: args => `${args[0]} > ${args[1]}`,
    //     exists: args => `NOT EXISTS (${args})`,
    // }
}

/*

[
    [{
        sql: 'SELECT'
    }]
]


*/

export const get_query_plan = (query) => {

}

export const get_subquery_sql = (query, subquery_path: string[], previous_results: [string[], Record<string, unknown>][]) => {
    
}