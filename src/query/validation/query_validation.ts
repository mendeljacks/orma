import { validate } from 'jsonschema'
import { OrmaError } from '../../helpers/error_handling'
import { is_simple_object, last } from '../../helpers/helpers'
import {
    get_parent_edges,
    is_table_name,
    is_column_name,
    is_parent_table,
    is_reserved_keyword
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../schema/schema_types'
import { Path } from '../../types'
import { OrmaQuery, WhereConnected } from '../../types/query/query_types'
import { sql_function_definitions } from '../ast_to_sql'
import { get_real_table_name, get_real_higher_table_name } from '../query'
import { is_subquery } from '../query_helpers'
import { query_validation_schema } from './query_validation_schema'

export const validate_query = (query, orma_schema: OrmaSchema) => {
    const schema_response = validate(query, query_validation_schema)
    if (schema_response.errors.length > 0) {
        // if the shape of the data is incorrect, we can't run the js validation since this may produce
        // nonsensical results or create actual runtime errors
        return schema_response.errors
    }
    const js_errors = validate_query_js(query, orma_schema)
    return [...schema_response.errors, ...js_errors]
}

export const validate_orma_query = async <T>(
    query: OrmaQuery<any, any>,
    orma_schema: OrmaSchema
) => {
    const errors = validate_query(query, orma_schema)
    if (errors.length > 0) {
        return Promise.reject(errors)
    }
    return []
}

/**
 * Handles the validation that is difficult for JSON schema, e.g. things which rely on the orma schema (and so would
 * require a code-generated JSON schema)
 */
const validate_query_js = (query, orma_schema: OrmaSchema) => {
    // check root level props which must be table names,
    // then generate errors for nested queries
    const column_errors = Object.keys(query)
        .filter(key => !is_reserved_keyword(key))
        .flatMap(key =>
            validate_outer_subquery(query, query[key], [key], orma_schema)
        )
        .map(error => ({ ...error, original_data: query }))

    const where_connected_errors = validate_where_connected(query, orma_schema)

    return [...column_errors, ...where_connected_errors]
}

const validate_outer_subquery = (
    query,
    subquery,
    subquery_path: string[],
    orma_schema: OrmaSchema
) => {
    const errors = [
        ...validate_common_subquery(subquery, subquery_path, orma_schema),
        ...validate_data_props(query, subquery, subquery_path, orma_schema),
        ...validate_select(subquery, subquery_path, false, orma_schema),
        ...validate_foreign_key(query, subquery, subquery_path, orma_schema)
    ]

    return errors
}

const validate_inner_subquery = (
    subquery,
    subquery_path: Path,
    required_one_column: boolean,
    orma_schema: OrmaSchema
) => {
    const errors = [
        ...validate_common_subquery(subquery, subquery_path, orma_schema),
        ...validate_select(subquery, subquery_path, false, orma_schema)
    ]

    return errors
}

const validate_common_subquery = (
    subquery,
    subquery_path: Path,
    orma_schema: OrmaSchema
): OrmaError[] => {
    const table_name = get_real_table_name(
        last(subquery_path) as string,
        subquery
    )

    const column_aliases = get_column_aliases(subquery)

    const errors = [
        ...validate_from_clause(subquery, subquery_path, orma_schema),
        ...validate_order_by(subquery, subquery_path, orma_schema),
        ...validate_group_by(subquery, subquery_path, orma_schema),
        ...validate_where(
            subquery?.$where,
            [...subquery_path, '$where'],
            '$where',
            table_name,
            [],
            orma_schema
        ),
        ...validate_where(
            subquery?.$having,
            [...subquery_path, '$having'],
            '$having',
            table_name,
            column_aliases,
            orma_schema
        )
    ]

    return errors
}

/**
 * validates that the query has a $from table, or an inferred $from based on the subquery prop
 */
const validate_from_clause = (
    subquery,
    subquery_path: Path,
    orma_schema: OrmaSchema
) => {
    const incorrect_from_clause =
        subquery?.$from && !is_table_name(orma_schema, subquery.$from)

    const table_name = get_real_table_name(
        last(subquery_path) as string,
        subquery
    )
    const incorrect_table = !is_table_name(orma_schema, table_name)

    const errors: OrmaError[] = incorrect_from_clause
        ? [
              {
                  message: `$from clause ${subquery.$from} is not a valid table name.`,
                  path: [...subquery_path, '$from']
              }
          ]
        : incorrect_table
        ? [
              {
                  message: `Subquery $from clause is ${
                      subquery?.$from
                  } and subquery property is ${last(
                      subquery_path
                  )}, neither of which are valid table names.`,
                  path: subquery_path
              }
          ]
        : []

    return errors
}

/**
 * Data props refer to props that end up in the response json, these are props without a $ at the front
 */
const validate_data_props = (
    query,
    subquery,
    subquery_path: string[],
    orma_schema: OrmaSchema
) => {
    // there are 5 cases for data properties:
    //   1. key is a column, value is a boolean. In this case the key will end up in the $select
    //   2. value is a column name. In this case the value will end up in the select
    //   3. value is an object with an SQL function (e.g. {$sum: 'column'})
    //   4. key is an table name, value is a subquery (doesnt need a $from clause). The subquery is from the
    //      table in key name
    //   5. value is a subquery with a $from clause (e.g. { id: true, $from: 'my_table'}). The subquery is from the
    //      table in the $from clause
    const errors: OrmaError[] = Object.keys(subquery).flatMap(prop => {
        if (is_reserved_keyword(prop)) {
            return []
        }

        const value = subquery[prop]
        const table_name = get_real_table_name(last(subquery_path), subquery)

        // case 1
        if (typeof value === 'boolean') {
            return !is_column_name(orma_schema, table_name, prop)
                ? [
                      {
                          message: `Property ${prop} is not a valid column name of table ${table_name}.`,
                          path: [...subquery_path, prop],
                          additional_info: {
                              prop,
                              table_name
                          }
                      }
                  ]
                : []
        }

        // cases 2 and 3
        const is_string = typeof value === 'string'
        const is_sql_function = is_simple_object(value) && !is_subquery(value)
        if (is_string || is_sql_function) {
            return validate_expression(
                value,
                [...subquery_path, prop],
                table_name,
                get_column_aliases(subquery),
                orma_schema
            )
        }

        // cases 4 and 5
        if (is_subquery(value)) {
            return validate_outer_subquery(
                query,
                value,
                [...subquery_path, prop],
                orma_schema
            )
        }

        return []
    })

    return errors
}

const validate_expression = (
    expression,
    expression_path: Path,
    context_table: string,
    column_aliases: string[],
    orma_schema
): OrmaError[] => {
    if (typeof expression === 'string') {
        const last_path_el = last(expression_path)
        const second_last_path_el = expression_path[expression_path.length - 2]

        // could be an array, so we might need to get the function name from one layer up
        const function_name =
            typeof last_path_el === 'string'
                ? last_path_el
                : second_last_path_el
        const sql_function_definition = sql_function_definitions[function_name]

        const can_have_star =
            sql_function_definition?.allow_star === true ||
            function_name === '$select'
        if (expression === '*' && can_have_star) {
            return []
        }

        const errors =
            !is_column_name(orma_schema, context_table, expression) &&
            !column_aliases.includes(expression)
                ? [
                      {
                          message: `${expression} is not a valid column name of table ${context_table}. If you want to use a literal value, try replacing ${expression} with {$escape: ${expression}}.`,
                          path: expression_path
                      }
                  ]
                : []

        return errors
    }

    if (expression?.$table) {
        if (!is_table_name(orma_schema, expression.$table)) {
            return [
                {
                    message: `${expression.$table} is not a valid table name.`,
                    path: [...expression_path, '$table']
                }
            ]
        }

        if (
            !is_column_name(orma_schema, expression.$table, expression.$column)
        ) {
            return [
                {
                    message: `${expression.$column} is not a valid column name of table ${expression.$table}.`,
                    path: [...expression_path, '$column']
                }
            ]
        }

        return []
    }

    if (is_simple_object(expression) && !is_subquery(expression)) {
        const props = Object.keys(expression)
        // expressions can have exactly one prop if they are mysql functions
        if (
            props.length !== 1 &&
            props.some(prop => sql_function_definitions[prop] !== undefined)
        ) {
            throw new Error('Expected one prop in expression')
        }

        const prop = props[0]

        if (prop === '$escape') {
            // escaped expressions dont need further validation, e.g. it can have any string not just a column name
            return []
        }

        const args_errors = Array.isArray(expression[prop])
            ? expression[prop].flatMap((arg, i) =>
                  validate_expression(
                      arg,
                      [...expression_path, prop, i],
                      context_table,
                      column_aliases,
                      orma_schema
                  )
              )
            : validate_expression(
                  expression[prop],
                  [...expression_path, prop],
                  context_table,
                  column_aliases,
                  orma_schema
              )

        return args_errors
    }

    // is an inner subquery
    if (is_simple_object(expression) && expression?.$select) {
        return validate_inner_subquery(
            expression,
            expression_path,
            true,
            orma_schema
        )
    }

    return []
}

const validate_select = (
    subquery,
    subquery_path,
    require_one_column: boolean,
    orma_schema: OrmaSchema
) => {
    const select = (subquery?.$select ?? []) as any[]
    const select_length = select.length
    const require_one_column_errors: OrmaError[] =
        require_one_column && select_length !== 1
            ? [
                  {
                      message: `Inner $select must have exactly one column, but it has ${select_length} columns.`,
                      path: [...subquery_path, '$select']
                  }
              ]
            : []

    const table_name = get_real_table_name(last(subquery_path), subquery)
    const expression_errors = select.flatMap((column, i) => {
        const column_aliases = select.flatMap((column, i2) => {
            if (i === i2) return []

            return column?.$as ? [column.$as[1]] : []
        })
        // for $as, the second item in the array is the alias name which is always valid if it passes
        // the json schema. here we just need to validate the first item as an expression.
        return column?.$as
            ? validate_expression(
                  column.$as[0],
                  [...subquery_path, '$select', i, '$as', 0],
                  table_name,
                  column_aliases,
                  orma_schema
              )
            : validate_expression(
                  column,
                  [...subquery_path, '$select', i],
                  table_name,
                  column_aliases,
                  orma_schema
              )
    })

    return [...require_one_column_errors, ...expression_errors]
}

const validate_foreign_key = (
    query,
    subquery,
    subquery_path,
    orma_schema: OrmaSchema
): OrmaError[] => {
    const $foreign_key = subquery.$foreign_key
    if (!$foreign_key) {
        return []
    }

    if ($foreign_key.length !== 1) {
        return [
            {
                message:
                    'Only a $foreign_key with one column is currently supported.',
                path: [...subquery_path, '$foreign_key'],
                additional_info: {
                    foreign_key_length: $foreign_key.length
                }
            }
        ]
    }

    const column = $foreign_key[0]

    const table = get_real_table_name(last(subquery_path), subquery)
    const higher_table = get_real_higher_table_name(subquery_path, query)
    const table_edges = get_parent_edges(table, orma_schema)
    const higher_table_edges = get_parent_edges(higher_table, orma_schema)

    const valid_edges = [
        ...table_edges.filter(edge => edge.to_table === higher_table),
        ...higher_table_edges.filter(edge => edge.to_table === table)
    ]
    const matching_edges = valid_edges.filter(edge => edge.from_columns === column)

    if (matching_edges.length === 0) {
        return [
            {
                message: `$foreign key must be either a column of ${table} which references ${higher_table} or a column of ${higher_table} which references ${table}.`,
                path: [...subquery_path, '$foreign_key', 0],
                additional_info: {
                    table,
                    higher_table,
                    valid_foreign_keys: valid_edges.map(edge => edge.from_columns)
                }
            }
        ]
    }

    return []
}

// group by and order by works on any column or selected column alias
const validate_group_by = (
    subquery,
    subquery_path: Path,
    orma_schema: OrmaSchema
) => {
    const table_name = get_real_table_name(
        last(subquery_path) as string,
        subquery
    )
    const group_bys = (subquery?.$group_by ?? []) as any[]
    const column_aliases = get_column_aliases(subquery)

    const errors = group_bys.flatMap((group_by, i) => {
        return validate_expression(
            group_by,
            [...subquery_path, '$group_by', i],
            table_name,
            column_aliases,
            orma_schema
        )
    })

    return errors
}

const validate_order_by = (
    subquery,
    subquery_path,
    orma_schema: OrmaSchema
) => {
    const table_name = get_real_table_name(last(subquery_path), subquery)
    const order_bys = (subquery?.$order_by ?? []) as any[]
    const column_aliases = get_column_aliases(subquery)

    const errors = order_bys.flatMap((order_by, i) => {
        const prop = Object.keys(order_by)[0] // this will be either $asc or $desc
        return validate_expression(
            order_by[prop],
            [...subquery_path, '$order_by', i, prop],
            table_name,
            column_aliases,
            orma_schema
        )
    })

    return errors
}

const get_column_aliases = subquery => {
    const select = (subquery?.$select ?? []) as any[]
    const select_aliases = select
        .map(select_el => select_el?.$as?.[1])
        .filter(el => el !== undefined)

    const data_aliases = Object.keys(subquery).filter(
        key => !is_reserved_keyword(key) && !is_subquery(key)
    )

    return [...select_aliases, ...data_aliases]
}

// where clauses can search on any column
// having clauses can search on any selected column or column alias
const validate_where = (
    where,
    where_path: Path,
    where_type: '$where' | '$having',
    context_table: string,
    column_aliases: string[],
    orma_schema: OrmaSchema
) => {
    if (where === undefined) {
        return []
    }

    const props = Object.keys(where)
    if (props.length !== 1) {
        throw new Error('Expected one prop in where clause.')
    }
    const prop = props[0]

    if (prop === '$not') {
        return validate_where(
            where[prop],
            [...where_path, prop],
            where_type,
            context_table,
            column_aliases,
            orma_schema
        )
    }

    if (prop === '$and' || prop === '$or') {
        return where[prop].flatMap((el, i) =>
            validate_where(
                el,
                [...where_path, prop, i],
                where_type,
                context_table,
                column_aliases,
                orma_schema
            )
        )
    }

    if (prop === '$in') {
        const column_errors = validate_expression(
            where[prop][0],
            [...where_path, prop, 0],
            context_table,
            column_aliases,
            orma_schema
        )

        const values_errors = Array.isArray(where[prop][1])
            ? where[prop][1].flatMap((el, i) =>
                  validate_expression(
                      el,
                      [...where_path, prop, 1, i],
                      context_table,
                      column_aliases,
                      orma_schema
                  )
              )
            : where[prop][1]?.$escape
            ? [] // if there is an escape, this is always valid
            : validate_inner_subquery(
                  where[prop][1],
                  [...where_path, prop, 1],
                  true,
                  orma_schema
              )

        return [...column_errors, ...values_errors]
    }

    if (prop === '$any_path') {
        return validate_any_path_clause(
            where,
            where_path,
            where_type,
            context_table,
            column_aliases,
            orma_schema
        )
    }

    // prop is an operation such as $gte or $like
    return Array.isArray(where[prop])
        ? where[prop].flatMap((el, i) =>
              validate_expression(
                  el,
                  [...where_path, prop, i],
                  context_table,
                  column_aliases,
                  orma_schema
              )
          )
        : validate_expression(
              where[prop],
              [...where_path, prop],
              context_table,
              column_aliases,
              orma_schema
          )
}

const validate_any_path_clause = (
    where,
    where_path: Path,
    where_type: '$where' | '$having',
    context_table: string,
    column_aliases: string[],
    orma_schema: OrmaSchema
) => {
    if (!where?.$any_path) {
        return []
    }

    const path = where.$any_path[0] as string[]
    const path_errors: OrmaError[] = path.flatMap((table, i) => {
        const previous_table = i === 0 ? context_table : path[i - 1]
        if (!is_table_name(orma_schema, table)) {
            return [
                {
                    message: `${table} is not a valid table name.`,
                    path: [...where_path, '$any_path', 0, i]
                }
            ]
        }

        const is_parent = is_parent_table(table, previous_table, orma_schema)
        const is_child = is_parent_table(previous_table, table, orma_schema)
        if (!is_parent && !is_child) {
            return [
                {
                    message: `${table} is not connected to previous table ${previous_table}.`,
                    path: [...where_path, '$any_path', 0, i]
                }
            ]
        }

        return []
    })

    const new_context_table = path.length > 0 ? last(path) : context_table

    const where_errors = validate_where(
        where.$any_path[1],
        [...where_path, '$any_path', 1],
        where_type,
        new_context_table,
        column_aliases,
        orma_schema
    )

    return [...path_errors, ...where_errors]
}

const validate_where_connected = (query, orma_schema: OrmaSchema) => {
    const where_connected = (query.$where_connected ??
        []) as WhereConnected<OrmaSchema>

    const done_columns = new Set<string>()
    const errors: OrmaError[] = where_connected.flatMap((el, i) => {
        if (!is_table_name(orma_schema, el.$table)) {
            return [
                {
                    message: `${el.$table} is not a valid table name.`,
                    path: ['$where_connected', i, '$table']
                }
            ]
        }

        if (!is_column_name(orma_schema, el.$table, el.$column)) {
            return [
                {
                    message: `${el.$column} is not a valid column name of table ${el.$table}.`,
                    path: ['$where_connected', i, '$column']
                }
            ]
        }

        // check for duplicates
        const column_string = JSON.stringify([el.$table, el.$column])
        if (done_columns.has(column_string)) {
            return [
                {
                    message: `Column ${el.$column} in table ${el.$table} appears more than once in the $where_connected.`,
                    path: ['$where_connected', i]
                }
            ]
        }
        done_columns.add(column_string)

        return []
    })

    return errors
}
