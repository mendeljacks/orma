// /*

// query is of form:

// query = expression

// expression = string | {
//     [command1]: expression | [expression],
//     [command2]: expression | [expression],
//     ...
//     [commandn]: expression | [expression],
// }
// */

// import { append, hasPath, indexOf, join, keys, path, slice, type } from 'ramda'
// import sqlFormatter from "sql-formatter"
// import { force_array } from '../../helpers/traversal'


// /*
// command parsers are functions of args. Nested parsers are matched by most specific command,
// e.g. 

// where -> in 

// will match 

// where: {
//     in: args => ...
// }

// if it exists in the command parsers, but if not it will also match

// in: args => ...

// */
// const sql_command_parsers = {
//     select: args => `SELECT ${force_array(args).join(', ')}`,
//     select_sql_calc_found_rows: args => `SELECT SQL_CALC_FOUND_ROWS ${force_array(args).join(', ')}`,
//     as: args => `(${args[0]}) AS ${args[1]}`,
//     sum: args => `SUM(${args}) AS sum_${args}`,
//     from: args => `FROM ${args}`,
//     where: args => `WHERE ${args}`,
//     having: args => `HAVING ${args}`,
//     in: args => `${args[0]} IN (${args[1]})`,
//     group_by: args => `GROUP BY ${force_array(args).join(', ')}`,
//     order_by: args => `ORDER BY ${force_array(args).join(', ')}`,
//     asc: args => `${args} ASC`,
//     desc: args => `${args} DESC`,
//     and: args => `(${args.join(') AND (')})`,
//     or: args => `(${args.join(') OR (')})`,
//     eq: args => args[1] === null ? `${args[0]} IS NULL` : `${args[0]} = ${args[1]}`,
//     gt: args => `${args[0]} > ${args[1]}`,
//     lt: args => `${args[0]} < ${args[1]}`,
//     gte: args => `${args[0]} >= ${args[1]}`,
//     lte: args => `${args[0]} <= ${args[1]}`,
//     exists: args => `EXISTS (${args})`,
//     limit: args => `LIMIT ${args}`,
//     offset: args => `OFFSET ${args}`,
//     like: args => {
//         const string_arg = args[1].toString()
//         const search_value = string_arg
//             .replace(/^\'/, '')
//             .replace(/\'$/, '') // get rid of quotes if they were put there by escape()
//         return `${args[0]} LIKE '%${search_value}%'`
//     },
//     not: {
//         in: args => `${args[0]} NOT IN (${args[1]})`,
//         and: args => `NOT ((${args.join(') AND (')}))`,
//         or: args => `NOT ((${args.join(') OR (')}))`,
//         eq: args => args[1] === null ? `${args[0]} IS NOT NULL` : `${args[0]} != ${args[1]}`,
//         gt: args => `${args[0]} <= ${args[1]}`,
//         lt: args => `${args[0]} >= ${args[1]}`,
//         gte: args => `${args[0]} < ${args[1]}`,
//         lte: args => `${args[0]} > ${args[1]}`,
//         exists: args => `NOT EXISTS (${args})`,
//     }
// }

// const command_order = ['select', 'from', 'where', 'group_by', 'having', 'order_by', 'limit', 'offset']

// // finds command from most specific path to least specific. Returns undefined if nothing is found
// const find_command_parser = (command_path, command_parsers) => {
//     for (let i = 0; i < command_path.length; i++) {
//         const ancestor_path = slice(i, Infinity, command_path)
//         if (hasPath(ancestor_path, command_parsers)) {
//             return path(ancestor_path, command_parsers)
//         }
//     }
// }


// /*

// expression = string | {
//     [command1]: expression | [expression],
//     [command2]: expression | [expression],
//     ...
//     [commandn]: expression | [expression],
// }

// */
// export const parse_json_query = (expression, command_parsers, command_joiner, throw_on_unknown=true, ancestors = []) => {
//     if (type(expression) === 'Object') {

//         const commands = keys(expression).sort((key1, key2) => { //sort based off the position in the command array. commands not specified are placed at the beginning
//             const i1 = indexOf(key1, command_order)
//             const i2 = indexOf(key2, command_order)
//             return i1 - i2
//         })

//         const parsed_commands = commands.map(command => {
//             const command_path = append(command, ancestors)

//             const args = expression[command]

//             const parse_arg = arg => parse_json_query(arg, command_parsers, command_joiner, throw_on_unknown, command_path)

//             const parsed_args = type(args) === 'Array'
//                 ? args.map(parse_arg)
//                 : parse_arg(args)

//             const command_parser = find_command_parser(command_path, command_parsers)

//             if (command_parser === undefined) {
//                 if (throw_on_unknown) {
//                     throw Error(`Cannot find command parser for ${command}`)
//                 } else {
//                     return {
//                         [command]: parsed_args
//                     }
//                 }
//             }

//             const parsed_command = type(command_parser) === 'Function' 
//                 ? command_parser(parsed_args, command_path)
//                 : parsed_args
//             return parsed_command
//         })

//         return command_joiner(parsed_commands)
//     } else {
//         return expression
//     }
// }

// export const json_to_sql = (expression, pretty = false) => {
//     const parsed = parse_json_query(expression, sql_command_parsers, join(' '))
//     if (pretty) {
//         return sqlFormatter.format(parsed)
//     } else {
//         return parsed
//     }
// }


// // TODO: make command order sorted by priority array