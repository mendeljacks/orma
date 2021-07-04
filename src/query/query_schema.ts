import { escape } from 'mysql'
import { compose, dropLast, equals, fromPairs, includes, join, keys, last, mapObjIndexed, prop, split, zipObj } from 'ramda'
import { escapeRegex } from '../helpers'
import read_schema_master_diff from '../no3rd/query_schema_diffs'
import { get_all_table_names, get_child_tables, get_column_names, get_edges, get_possible_child_edges, get_possible_parent_edges } from "../traversal2"
import { table_info } from "../../generated/_generated_table_info"
const memoize = require('memoizee')


const Joi = require('joi')


export const get_relevant_diff_functions = (is_meta, table_name, master_diff) => {
    const table_names = get_all_table_names(table_info)
    const matching_diff_pairs = keys(master_diff).flatMap(key => {
        let key_is_meta, key_table, key_field
        const split_key = key.split('/')

        const is_formatted_root =
            split_key.length === 2
            && split_key[0] === ''
            && split_key[1] !== 'meta'
            && !includes(split_key[1], table_names)

        const is_formatted_meta =
            split_key.length === 3
            && split_key[0] === 'meta'
            && includes(split_key[1], table_names)
            && !includes(split_key[2], table_names)

        if (is_formatted_root) {
            key_is_meta = false
            key_table = split_key[0]
            key_field = split_key[1]
        } else if (is_formatted_meta) {
            is_meta = true
            key_table = split_key[1]
            key_field = split_key[2]
        } else {
            throw Error('Wrong key format. Key should be like \'/root_level_column\' or \'meta/table/column\'')
        }

        const diff = schema => master_diff[key](schema)

        if (key_is_meta === is_meta && key_table === table_name) {
            return [[key_field, diff]]
        } else {
            return []
        }
    })

    const diffs_object = fromPairs(matching_diff_pairs)
    return diffs_object
}

const get_meta_schema = () => {
    const table_names = get_all_table_names(table_info)
    const table_schemas = table_names.map(table_name => {
        const diffs_by_key = get_relevant_diff_functions(true, table_name, read_schema_master_diff)
        const key_schemas = keys(diffs_by_key).map(key => diffs_by_key[key]())
        const table_schema = Joi.object().keys(
            ...key_schemas
        )

        return table_schema
    })

    const table_schema_fields = zipObj(table_names, table_schemas)

    const meta_schema = Joi.object().keys({
        ...table_schema_fields
    }).xor(...table_names)

    return table_schemas
}

const get_select_schema = table_name => {
    const column_names = get_column_names(table_name, table_info)
    const aggregate_columns = [
        Joi.object().keys({
            sum: Joi.valid(...column_names).required()
        })
    ]

    // if group by is provided, we can only select from the grouped column, or from aggregate columns
    const column_schema = Joi.when('...group_by', {
        switch: [
            {
                is: Joi.array().required(),
                then: Joi.alternatives(
                    Joi.in('...group_by'),
                    ...aggregate_columns,
                    Joi.valid('*')
                ).required()
            }, {
                is: Joi.alternatives(
                    Joi.string().required(),
                    Joi.number().required()
                ).required(),
                then: Joi.alternatives(
                    Joi.ref('...group_by'),
                    ...aggregate_columns,
                    Joi.valid('*')
                ).required()
            }
        ],
        otherwise: Joi
            .valid(...column_names)
            .valid(...aggregate_columns).required()
    })


    const schema = [
        Joi.array().items(column_schema).min(1).required(),
        column_schema,
        Joi.valid('*').required(),
    ]

    return schema
}


// returns a regex that is only valid for the given items separated by dots
const get_delimited_list_regex = (valid_options, delimiter) => {
    const item_regex = valid_options.map(escapeRegex).join('|')
    const list_regex = `^(${item_regex})(${escapeRegex(delimiter)}(${item_regex}))*$`
    return RegExp(list_regex)
}


// returns a regex that is valid if each dot separated item is either the parent or child of the item before it
const get_invalid_table_relation_regex = (table_infos) => {
    const table_names = get_all_table_names(table_infos)
    const table_checks = table_names.map(table_name => {

        const child_tables = get_possible_child_edges(table_name, table_infos)
            .concat(get_possible_parent_edges(table_name, table_infos))
            .map(prop('to_table'))

        const child_tables_regex = child_tables
            .map(child => `(${escapeRegex(child)})`)
            // .concat('$') // end of string is considered a valid child. If there are no children, this is the only valid child, since nothing can come next
            .join('|')

        return `((^|\\.)${escapeRegex(table_name)}\\.(?!${child_tables_regex}))` // matches the table name followed by something that is not a child
    })

    const regex_str = table_checks.join('|')
    return RegExp(regex_str)
}

// returns a regex that passes if the string starts with a table name that is either a parent or child of the supplied table_name
const get_starts_with_connected_table_regex = (table_name, table_infos) => {

    const connected_tables = get_possible_child_edges(table_name, table_infos)
        .concat(get_possible_parent_edges(table_name, table_infos))
        .map(prop('to_table'))

    const connected_tables_regex = connected_tables
        .map(child => `(${escapeRegex(child)})`)
        .join('|')

    return RegExp(`^(${connected_tables_regex})`)
}

const get_where_schema = (table_name, is_having_clause = false) => {
    const column_names = get_column_names(table_name, table_info)
    const aggregate_column_names = column_names.map(column_name => `sum_${column_name}`)

    const column_schema = is_having_clause
        ? Joi.string().valid(...column_names).required()
        : Joi.string().valid(...column_names).valid(...aggregate_column_names).required()

    const user_value_schema = Joi.alternatives(Joi.string(), Joi.number()).required().custom((val, helpers) => {
        return escape(val)
    })

    const operation_schema = Joi.array().ordered(column_schema, user_value_schema)

    const table_names = get_all_table_names(table_info)
    const route_table_regex = get_delimited_list_regex(table_names, '.')
    const invalid_table_relation_regex = get_invalid_table_relation_regex(table_info)
    const starts_with_connected_table_regex = get_starts_with_connected_table_regex(table_name, table_info)

    const any_route_schema = Joi.string()
        .regex(route_table_regex, { name: 'has only valid table names' })
        .regex(invalid_table_relation_regex, { invert: true, name: 'has only connected tables together' })
        .regex(starts_with_connected_table_regex, { name: `starts with child or parent of ${table_name}` })

    const any_where_schema = Joi.when('', { // empty string somehow refers to first element in the array, Joi refs are wierd like that
        switch: table_names.map(child_table => ({
            is: Joi.string().regex(RegExp(`(\\.|^)${child_table}$`)).required(), // matches if the child table is at the end of the string
            then: Joi.link('/' + child_table + '.where')
        })),
        otherwise: Joi.forbidden()
    })

    const this_schema = Joi.link('/' + table_name + '.where')

    const schema_obj = {
        eq: Joi.array().ordered(
            column_schema,
            Joi.alternatives(Joi.string(), Joi.number(), Joi.allow(null)).required().custom((val, helpers) => {
                return escape(val)
            })
        ),
        gt: operation_schema,
        lt: operation_schema,
        gte: operation_schema,
        lte: operation_schema,
        and: Joi.array().items(this_schema).min(1).max(1000),
        or: Joi.array().items(this_schema).min(1).max(1000),
        in: Joi.array().ordered(column_schema, Joi.array().items(user_value_schema).min(1).max(10000).required()),
        like: operation_schema,
        not: this_schema.concat(Joi.object().keys({
            not: Joi.forbidden()
        })),
        any: Joi.array().ordered(any_route_schema, any_where_schema)
    }

    const schema = Joi.object().keys(schema_obj)
        .xor(...keys(schema_obj))

    return schema
}

const get_group_by_schema = table_name => {
    const column_names = get_column_names(table_name, table_info)
    const term_schema = Joi.valid(...column_names).required()

    return Joi.alternatives(
        Joi.array().items(term_schema).min(1).required(),
        term_schema,
    )
}

const get_order_by_schema = table_name => {
    const column_names = get_column_names(table_name, table_info)
    const term_schema = Joi.alternatives(
        Joi.valid(...column_names),
        Joi.object().keys({
            asc: Joi.valid(...column_names),
            desc: Joi.valid(...column_names),
        }).xor('asc', 'desc')
    ).required()

    return Joi.alternatives(
        Joi.array().items(term_schema).min(1).required(),
        term_schema,
    )
}

export const get_query_schema = (master_diff) => {
    const table_names = get_all_table_names(table_info)
    const table_schemas = table_names.map(table_name => {
        const child_tables = get_child_tables(table_name, table_info)
        const parent_tables = get_possible_parent_edges(table_name, table_info)
            .map(prop('to_table'))
        const lower_tables = child_tables.concat(parent_tables)
        const lower_table_schemas = lower_tables.map(child_table => {
            const parent_foreign_keys = get_edges(child_table, table_name, table_info)
                .map(prop('to_key'))

            return Joi.when('group_by', { // cant nest on things if parent is grouped and this table isnt one of the grouped tables
                is: Joi.alternatives(
                    Joi.forbidden(), // group by not supplied
                    Joi.valid(...parent_foreign_keys).required(), // group by is for child_table
                    Joi.array().items(Joi.any(), Joi.valid(...parent_foreign_keys).required()) // group by is an array including child_table
                ),
                then: Joi.link('/' + child_table),
                otherwise: Joi.forbidden()
            })
        })

        const lower_schema_keys = zipObj(lower_tables, lower_table_schemas)

        const table_schema = Joi.object().keys({
            select: get_select_schema(table_name),
            where: get_where_schema(table_name),
            having: get_where_schema(table_name),
            limit: Joi.number().integer().min(1),
            offset: Joi.number().integer().min(0),
            group_by: get_group_by_schema(table_name),
            order_by: get_order_by_schema(table_name),
            ...lower_schema_keys
        })

        return table_schema
    })


    const diffs_by_field = get_relevant_diff_functions(false, '', master_diff)
    const new_field_names = keys(diffs_by_field)
    const new_field_schemas = new_field_names.map(field => diffs_by_field[field]())

    const query_schema = Joi.object().keys({
        ...zipObj(table_names, table_schemas),
        ...zipObj(new_field_names, new_field_schemas)
    }).xor(...table_names)

    return query_schema
}

export const read_query_schema = memoize(get_query_schema)

const a = {
    $asd: 1
}