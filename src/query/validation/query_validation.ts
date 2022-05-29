import { validate } from 'jsonschema'
import { OrmaError } from '../../helpers/error_handling'
import { force_array, is_simple_object, last } from '../../helpers/helpers'
import {
    is_entity_name,
    is_field_name,
    is_parent_entity,
    is_reserved_keyword,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { Path } from '../../types'
import { WhereConnected } from '../../types/query/query_types'
import { sql_function_definitions } from '../json_sql'
import { get_real_entity_name } from '../query'
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

/**
 * Handles the validation that is difficult for JSON schema, e.g. things which rely on the orma schema (and so would
 * require a code-generated JSON schema)
 */
const validate_query_js = (query, orma_schema: OrmaSchema) => {
    // check root level props which must be entity names,
    // then generate errors for nested queries
    const field_errors = Object.keys(query)
        .filter(key => !is_reserved_keyword(key))
        .flatMap(key => validate_outer_subquery(query[key], [key], orma_schema))
        .map(error => ({ ...error, original_data: query }))

    const where_connected_errors = validate_where_connected(query, orma_schema)

    return [
        ...field_errors,
        ...where_connected_errors
    ]
}

const validate_outer_subquery = (
    subquery,
    subquery_path: string[],
    orma_schema: OrmaSchema
) => {
    const errors = [
        ...validate_common_subquery(subquery, subquery_path, orma_schema),
        ...validate_data_props(subquery, subquery_path, orma_schema),
    ]

    return errors
}

const validate_inner_subquery = (
    subquery,
    subquery_path: Path,
    required_one_field: boolean,
    orma_schema: OrmaSchema
) => {
    const errors = [
        ...validate_common_subquery(subquery, subquery_path, orma_schema),
        ...validate_select(
            subquery,
            subquery_path,
            required_one_field,
            orma_schema
        ),
    ]

    return errors
}

const validate_common_subquery = (
    subquery,
    subquery_path: Path,
    orma_schema: OrmaSchema
): OrmaError[] => {
    const entity_name = get_real_entity_name(
        last(subquery_path) as string,
        subquery
    )

    const field_aliases = get_field_aliases(subquery)

    const errors = [
        ...validate_from_clause(subquery, subquery_path, orma_schema),
        ...validate_order_by(subquery, subquery_path, orma_schema),
        ...validate_group_by(subquery, subquery_path, orma_schema),
        ...validate_where(
            subquery?.$where,
            [...subquery_path, '$where'],
            '$where',
            entity_name,
            [],
            orma_schema
        ),
        ...validate_where(
            subquery?.$having,
            [...subquery_path, '$having'],
            '$having',
            entity_name,
            field_aliases,
            orma_schema
        ),
    ]

    return errors
}

/**
 * validates that the query has a $from entity, or an inferred $from based on the subquery prop
 */
const validate_from_clause = (
    subquery,
    subquery_path: Path,
    orma_schema: OrmaSchema
) => {
    const incorrect_from_clause =
        subquery?.$from && !is_entity_name(subquery.$from, orma_schema)

    const entity_name = get_real_entity_name(
        last(subquery_path) as string,
        subquery
    )
    const incorrect_entity = !is_entity_name(entity_name, orma_schema)

    const errors: OrmaError[] = incorrect_from_clause
        ? [
              {
                  message: `$from clause ${subquery.$from} is not a valid entity name.`,
                  path: [...subquery_path, '$from'],
              },
          ]
        : incorrect_entity
        ? [
              {
                  message: `Subquery $from clause is ${
                      subquery?.$from
                  } and subquery property is ${last(
                      subquery_path
                  )}, neither of which are valid entity names.`,
                  path: subquery_path,
              },
          ]
        : []

    return errors
}

/**
 * Data props refer to props that end up in the response json, these are props without a $ at the front
 */
const validate_data_props = (
    subquery,
    subquery_path: string[],
    orma_schema: OrmaSchema
) => {
    // there are 5 cases for data properties:
    //   1. key is a field, value is a boolean. In this case the key will end up in the $select
    //   2. value is a field name. In this case the value will end up in the select
    //   3. value is an object with an SQL function (e.g. {$sum: 'field'})
    //   4. key is an entity name, value is a subquery (doesnt need a $from clause). The subquery is from the
    //      entity in key name
    //   5. value is a subquery with a $from clause (e.g. { id: true, $from: 'my_table'}). The subquery is from the
    //      entity in the $from clause
    const errors: OrmaError[] = Object.keys(subquery).flatMap(prop => {
        if (is_reserved_keyword(prop)) {
            return []
        }

        const value = subquery[prop]
        const entity_name = get_real_entity_name(last(subquery_path), subquery)

        // case 1
        if (typeof value === 'boolean') {
            return !is_field_name(entity_name, prop, orma_schema)
                ? [
                      {
                          message: `Property ${prop} is not a valid field name of entity ${entity_name}.`,
                          path: [...subquery_path, prop],
                          additional_info: {
                              prop,
                              entity_name,
                          },
                      },
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
                entity_name,
                [], // mysql doesnt let references to field aliases in a select
                orma_schema
            )
        }

        // cases 4 and 5
        if (is_subquery(value)) {
            return validate_outer_subquery(
                value,
                [...subquery_path, prop],
                orma_schema
            )
        }
    })

    return errors
}

const validate_expression = (
    expression,
    expression_path: Path,
    context_entity: string,
    field_aliases: string[],
    orma_schema
): OrmaError[] => {
    if (typeof expression === 'string') {
        const function_name = last(expression_path)
        const sql_function_definition = sql_function_definitions[function_name]
        if (expression === '*' && sql_function_definition.allow_star === true) {
            return []
        }
        
        return !is_field_name(context_entity, expression, orma_schema) &&
            !field_aliases.includes(expression)
            ? [
                  {
                      message: `${expression} is not a valid field name of entity ${context_entity}.`,
                      path: expression_path,
                  },
              ]
            : []
    }

    if (is_simple_object(expression) && !is_subquery(expression)) {
        const props = Object.keys(expression)
        // expressions can have exactly one prop if they are mysql functions
        if (props.length !== 1) {
            throw new Error('Expected one prop in expression')
        }

        const prop = props[0]

        if (prop === '$escape') {
            // escaped expressions dont need further validation, e.g. it can have any string not just a field name
            return []
        }

        const args = force_array(expression[prop])
        const args_errors = args.flatMap(arg =>
            validate_expression(
                arg,
                [...expression_path, prop],
                context_entity,
                field_aliases,
                orma_schema
            )
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
    require_one_field: boolean,
    orma_schema: OrmaSchema
) => {
    const select = (subquery?.$select ?? []) as any[]
    const select_length = select.length
    const require_one_field_errors: OrmaError[] =
        require_one_field && select_length !== 1
            ? [
                  {
                      message: `Inner $select must have exactly one field, but it has ${select_length} fields.`,
                      path: [...subquery_path, '$select'],
                  },
              ]
            : []

    const entity_name = get_real_entity_name(last(subquery_path), subquery)
    const expression_errors = select.flatMap((field, i) =>
        validate_expression(
            field,
            [...subquery_path, '$select', i],
            entity_name,
            [],
            orma_schema
        )
    )

    return [...require_one_field_errors, ...expression_errors]
}

// group by and order by works on any field or selected field alias
const validate_group_by = (
    subquery,
    subquery_path: Path,
    orma_schema: OrmaSchema
) => {
    const entity_name = get_real_entity_name(
        last(subquery_path) as string,
        subquery
    )
    const group_bys = (subquery?.$group_by ?? []) as any[]
    const field_aliases = get_field_aliases(subquery)

    const errors = group_bys.flatMap((group_by, i) => {
        return validate_expression(
            group_by,
            [...subquery_path, '$group_by', i],
            entity_name,
            field_aliases,
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
    const entity_name = get_real_entity_name(last(subquery_path), subquery)
    const order_bys = (subquery?.$order_by ?? []) as any[]
    const field_aliases = get_field_aliases(subquery)

    const errors = order_bys.flatMap((order_by, i) => {
        const prop = Object.keys(order_by)[0] // this will be either $asc or $desc
        return validate_expression(
            order_by[prop],
            [...subquery_path, '$order_by', i, prop],
            entity_name,
            field_aliases,
            orma_schema
        )
    })

    return errors
}

const get_field_aliases = subquery => {
    const select = (subquery?.$select ?? []) as any[]
    const select_aliases = select
        .map(select_el => select_el?.$as?.[1])
        .filter(el => el !== undefined)

    const data_aliases = Object.keys(subquery).filter(
        key => !is_reserved_keyword(key) && !is_subquery(key)
    )

    return [...select_aliases, ...data_aliases]
}

// where clauses can search on any field
// having clauses can search on any selected field or field alias
const validate_where = (
    where,
    where_path: Path,
    where_type: '$where' | '$having',
    context_entity: string,
    field_aliases: string[],
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
            context_entity,
            field_aliases,
            orma_schema
        )
    }

    if (prop === '$and' || prop === '$or') {
        return where[prop].flatMap((el, i) =>
            validate_where(
                el,
                [...where_path, prop, i],
                where_type,
                context_entity,
                field_aliases,
                orma_schema
            )
        )
    }

    if (prop === '$in') {
        const field_errors = validate_expression(
            where[prop][0],
            [...where_path, prop, 0],
            context_entity,
            field_aliases,
            orma_schema
        )

        const values_errors = Array.isArray(where[prop][1])
            ? where[prop][1].flatMap((el, i) =>
                  validate_expression(
                      el,
                      [...where_path, prop, 1, i],
                      context_entity,
                      field_aliases,
                      orma_schema
                  )
              )
            : validate_inner_subquery(
                  where[prop][1],
                  [...where_path, prop, 1],
                  true,
                  orma_schema
              )

        return [...field_errors, ...values_errors]
    }

    if (prop === '$any_path') {
        return validate_any_path_clause(
            where,
            where_path,
            where_type,
            context_entity,
            field_aliases,
            orma_schema
        )
    }

    // prop is an operation such as $gte or $like
    return where[prop].flatMap((el, i) =>
        validate_expression(
            el,
            [...where_path, prop, i],
            context_entity,
            field_aliases,
            orma_schema
        )
    )
}

const validate_any_path_clause = (
    where,
    where_path: Path,
    where_type: '$where' | '$having',
    context_entity: string,
    field_aliases: string[],
    orma_schema: OrmaSchema
) => {
    if (!where?.$any_path) {
        return []
    }

    const path = where.$any_path[0] as string[]
    const path_errors: OrmaError[] = path.flatMap((entity, i) => {
        const previous_entity = i === 0 ? context_entity : path[i - 1]
        if (!is_entity_name(entity, orma_schema)) {
            return [
                {
                    message: `${entity} is not a valid entity name.`,
                    path: [...where_path, '$any_path', 0, i],
                },
            ]
        }

        const is_parent = is_parent_entity(entity, previous_entity, orma_schema)
        const is_child = is_parent_entity(previous_entity, entity, orma_schema)
        if (!is_parent && !is_child) {
            return [
                {
                    message: `${entity} is not connected to previous entity ${previous_entity}.`,
                    path: [...where_path, '$any_path', 0, i],
                },
            ]
        }

        return []
    })

    const new_context_entity = path.length > 0 ? last(path) : context_entity

    const where_errors = validate_where(
        where.$any_path[1],
        [...where_path, '$any_path', 1],
        where_type,
        new_context_entity,
        field_aliases,
        orma_schema
    )

    return [...path_errors, ...where_errors]
}

const validate_where_connected = (query, orma_schema: OrmaSchema) => {
    const where_connected = (query.$where_connected ?? []) as WhereConnected<OrmaSchema>

    const done_fields = new Set<string>()
    const errors: OrmaError[] = where_connected.flatMap((el, i) => {
        if (!is_entity_name(el.$entity, orma_schema)) {
            return [{
                message: `${el.$entity} is not a valid entity name.`,
                path: ['$where_connected', i, '$entity']
            }]
        }

        if (!is_field_name(el.$entity, el.$field, orma_schema)) {
            return [{
                message: `${el.$field} is not a valid field name of entity ${el.$entity}.`,
                path: ['$where_connected', i, '$field']
            }]
        }

        // check for duplicates
        const field_string = JSON.stringify([el.$entity, el.$field])
        if (done_fields.has(field_string)) {
            return [{
                message: `Field ${el.$field} in entity ${el.$entity} appears more than once in the $where_connected.`,
                path: ['$where_connected', i]
            }]
        }
        done_fields.add(field_string)

        return []
    })

    return errors
}