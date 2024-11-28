import { OrmaError } from '../../helpers/error_handling'
import { is_array } from '../../helpers/helpers'
import { GetAllTables } from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { OrmaQueryAliases } from '../../types/query/query_types'
import { validate } from '../common/validator'
import { QueryCompilerArgs, QueryValidatorArgs } from '../compiler'
import {
    compile_expression,
    Expression,
    validate_expression
} from '../expression/compile_expression'
import { compile_select, Select, validate_select } from './compile_select'

export const compile_where = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    table_name,
    statement
}: QueryCompilerArgs<Schema, Where<Schema, Aliases, Table>>): string => {
    if ('eq' in statement) {
        const [left_arg, right_arg] = statement.eq

        if (is_array(left_arg) && is_array(right_arg)) {
            if (
                left_arg.some(el => is_escaped_null(el)) ||
                right_arg.some(el => is_escaped_null(el))
            ) {
                return compile_where({
                    orma_schema,
                    table_name,
                    statement: {
                        and: left_arg.map((_, i) => ({
                            eq: [left_arg[i], right_arg[i]]
                        }))
                    }
                })
            }
        }

        if (!is_array(left_arg) && !is_array(right_arg)) {
            const compiled_left_arg = compile_expression({
                orma_schema,
                table_name,
                statement: left_arg
            })
            const compiled_right_arg = compile_expression({
                orma_schema,
                table_name,
                statement: right_arg
            })

            if (is_escaped_null(left_arg)) {
                return `${compiled_right_arg} IS NULL`
            }

            if (is_escaped_null(right_arg)) {
                return `${compiled_left_arg} IS NULL`
            }

            return `${compiled_left_arg} = ${compiled_right_arg}`
        }

        throw new Error('Eq clause is in the wrong format.')
    }

    if ('gt' in statement) {
        return `${compile_expression({
            orma_schema,
            table_name,
            statement: statement.gt[0]
        })} > ${compile_expression({
            orma_schema,
            table_name,
            statement: statement.gt[1]
        })}`
    }

    if ('lt' in statement) {
        return `${compile_expression({
            orma_schema,
            table_name,
            statement: statement.lt[0]
        })} < ${compile_expression({
            orma_schema,
            table_name,
            statement: statement.lt[1]
        })}`
    }

    if ('gte' in statement) {
        return `${compile_expression({
            orma_schema,
            table_name,
            statement: statement.gte[0]
        })} >= ${compile_expression({
            orma_schema,
            table_name,
            statement: statement.gte[1]
        })}`
    }

    if ('lte' in statement) {
        return `${compile_expression({
            orma_schema,
            table_name,
            statement: statement.lte[0]
        })} <= ${compile_expression({
            orma_schema,
            table_name,
            statement: statement.lte[1]
        })}`
    }

    if ('like' in statement) {
        return `${compile_expression({
            orma_schema,
            table_name,
            statement: statement.like[0]
        })} LIKE ${compile_expression({
            orma_schema,
            table_name,
            statement: statement.like[1]
        })}`
    }

    if ('in' in statement) {
        const first_arg = statement.in[0]
        const second_arg = statement.in[1]
        if (
            is_array(first_arg) &&
            is_array(second_arg) &&
            second_arg.every(el => is_array(el))
        ) {
            return `${first_arg
                .map(el =>
                    compile_expression({
                        orma_schema,
                        table_name,
                        statement: el
                    })
                )
                .join(', ')}) IN (${second_arg
                .map(els =>
                    els
                        .map(el =>
                            compile_expression({
                                orma_schema,
                                table_name,
                                statement: el
                            })
                        )
                        .join(', ')
                )
                .join(', ')})`
        }

        if (
            !is_array(first_arg) &&
            is_array(second_arg) &&
            !second_arg.every(el => is_array(el))
        ) {
            return `${compile_expression({
                orma_schema,
                table_name,
                statement: first_arg
            })} IN (${second_arg
                .map(el =>
                    compile_expression({
                        orma_schema,
                        table_name,
                        statement: el
                    })
                )
                .join(', ')})`
        }

        if (!is_array(first_arg) && 'from' in second_arg) {
            return `${compile_expression({
                orma_schema,
                table_name,
                statement: first_arg
            })} IN (${compile_select({ orma_schema, statement: second_arg })})`
        }

        throw new Error('In clause is in the wrong format.')
    }

    if ('exists' in statement) {
        return `EXISTS (${compile_select({
            orma_schema,
            statement: statement.exists
        })})`
    }
    if ('not' in statement) {
        return `NOT (${compile_where({
            orma_schema,
            table_name,
            statement: statement.not
        })})`
    }

    if ('and' in statement) {
        return statement.and
            .map(el =>
                compile_where({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(' AND ')
    }

    if ('or' in statement) {
        return statement.or
            .map(el =>
                compile_where({
                    orma_schema,
                    table_name,
                    statement: el
                })
            )
            .join(' OR ')
    }

    throw new Error('Unrecognized where clause.')
}

const is_escaped_null = (
    expression: Expression<OrmaSchema, OrmaQueryAliases<OrmaSchema>, string>
) => {
    return (
        typeof expression === 'object' &&
        'escape' in expression &&
        expression.escape === null
    )
}

export const validate_where = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    statement,
    path,
    aliases_by_table,
    table_name
}: QueryValidatorArgs<Schema, Where<Schema, Aliases, Table>> & {
    table_name: GetAllTables<Schema>
}): OrmaError[] => {
    if ('eq' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    eq: { type: 'array', minItems: 2, maxItems: 2 }
                },
                required: ['eq']
            },
            path,
            statement
        )

        if (base_errors.length) {
            return base_errors
        }

        const [left_arg, right_arg] = statement.eq
        if (is_array(left_arg) || is_array(right_arg)) {
            if (
                !is_array(left_arg) ||
                !is_array(right_arg) ||
                left_arg?.length !== right_arg?.length
            ) {
                return [
                    {
                        message: `Using eq on arrays requires both arguments to be arrays of the same length.`,
                        path: [...path, 'eq']
                    }
                ] as OrmaError[]
            }

            const left_arg_errors =
                left_arg?.flatMap?.((arg, i) =>
                    validate_expression({
                        orma_schema,
                        statement: arg,
                        aliases_by_table,
                        path: [...path, 'eq', 0, i],
                        table_name
                    })
                ) ?? []

            const right_arg_errors =
                right_arg?.flatMap?.((arg, i) =>
                    validate_expression({
                        orma_schema,
                        statement: arg,
                        aliases_by_table,
                        path: [...path, 'eq', 1, i],
                        table_name
                    })
                ) ?? []

            return [...left_arg_errors, ...right_arg_errors]
        }

        const argument_errors = [
            ...validate_expression({
                orma_schema,
                statement: left_arg,
                aliases_by_table,
                path: [...path, 'eq', 0],
                table_name
            }),
            ...validate_expression({
                orma_schema,
                statement: right_arg,
                aliases_by_table,
                path: [...path, 'eq', 1],
                table_name
            })
        ]

        return argument_errors
    }

    if ('gt' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: { gt: { type: 'array', minItems: 2, maxItems: 2 } },
                required: ['gt']
            },
            path,
            statement
        )
        const argument_errors =
            statement?.gt?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'gt', i],
                    table_name
                })
            ) ?? []
        return [...base_errors, ...argument_errors]
    }

    if ('lt' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: { lt: { type: 'array', minItems: 2, maxItems: 2 } },
                required: ['lt']
            },
            path,
            statement
        )
        const argument_errors =
            statement?.lt?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'lt', i],
                    table_name
                })
            ) ?? []
        return [...base_errors, ...argument_errors]
    }

    if ('gte' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    gte: { type: 'array', minItems: 2, maxItems: 2 }
                },
                required: ['gte']
            },
            path,
            statement
        )
        const argument_errors =
            statement?.gte?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'gte', i],
                    table_name
                })
            ) ?? []
        return [...base_errors, ...argument_errors]
    }

    if ('lte' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    lte: { type: 'array', minItems: 2, maxItems: 2 }
                },
                required: ['lte']
            },
            path,
            statement
        )
        const argument_errors =
            statement?.lte?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'lte', i],
                    table_name
                })
            ) ?? []
        return [...base_errors, ...argument_errors]
    }

    if ('like' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    like: { type: 'array', minItems: 2, maxItems: 2 }
                },
                required: ['like']
            },
            path,
            statement
        )
        const argument_errors =
            statement?.like?.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'like', i],
                    table_name
                })
            ) ?? []
        return [...base_errors, ...argument_errors]
    }

    if ('in' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    in: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 2
                    }
                },
                required: ['in']
            },
            path,
            statement
        )

        if (base_errors.length) {
            return base_errors
        }

        const first_arg = statement?.in?.[0]
        const second_arg = statement?.in?.[1]
        if (is_array(first_arg)) {
            if (!first_arg.length) {
                return [
                    {
                        message: `The first argument to the in clause must not be empty.`,
                        path: [...path, 'in', 0]
                    } as OrmaError
                ]
            }

            if (
                !is_array(second_arg) ||
                !second_arg.every(el => is_array(el)) ||
                !second_arg.every(el => el.length !== first_arg.length)
            ) {
                return [
                    {
                        message: `The second argument to the in clause must be an array of arrays of length ${first_arg.length}.`,
                        path: [...path, 'in', 0]
                    } as OrmaError
                ]
            }

            const first_arg_errors =
                first_arg.flatMap?.((arg, i) =>
                    validate_expression({
                        orma_schema,
                        statement: arg,
                        aliases_by_table,
                        path: [...path, 'in', 0, i],
                        table_name
                    })
                ) ?? []
            const second_arg_errors =
                second_arg?.flatMap(
                    (arg1, i1) =>
                        arg1?.flatMap((arg2, i2) =>
                            validate_expression({
                                orma_schema,
                                statement: arg2,
                                aliases_by_table,
                                path: [...path, 'in', 1, i1, i2],
                                table_name
                            })
                        ) ?? []
                ) ?? []

            return [...first_arg_errors, ...second_arg_errors]
        }

        const first_arg_errors = validate_expression({
            orma_schema,
            statement: first_arg,
            aliases_by_table,
            path: [...path, 'in', 0],
            table_name
        })

        if ('from' in second_arg) {
            const second_arg_errors = validate_select({
                orma_schema,
                statement: second_arg,
                aliases_by_table,
                path: [...path, 'in', 1],
                require_one_select: true
            })
            return [...first_arg_errors, ...second_arg_errors]
        }

        if (!is_array(second_arg)) {
            return [
                ...first_arg_errors,
                {
                    message: `Second argument to in clause must be an array of expressions.`,
                    path: [...path, 'in', 1]
                } as OrmaError
            ]
        }

        const second_arg_errors =
            second_arg.flatMap?.((arg, i) =>
                validate_expression({
                    orma_schema,
                    statement: arg as Expression<Schema, Aliases, Table>,
                    aliases_by_table,
                    path: [...path, 'in', 1, i],
                    table_name
                })
            ) ?? []
        return [...first_arg_errors, ...second_arg_errors]
    }

    if ('exists' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    exists: { type: 'object' }
                },
                required: ['exists']
            },
            path,
            statement
        )
        const arg_errors = validate_select({
            orma_schema,
            statement: statement.exists,
            aliases_by_table,
            path: [...path, 'exists']
        })

        return [...base_errors, ...arg_errors]
    }
    if ('not' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    not: { type: 'object' }
                },
                required: ['not']
            },
            path,
            statement
        )
        const arg_errors = validate_where({
            orma_schema,
            statement: statement.not,
            aliases_by_table,
            path: [...path, 'not'],
            table_name
        })

        return [...base_errors, ...arg_errors]
    }

    if ('and' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    and: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'object' }
                    }
                },
                required: ['and']
            },
            path,
            statement
        )
        const argument_errors =
            statement?.and?.flatMap?.((arg, i) =>
                validate_where({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'and', i],
                    table_name
                })
            ) ?? []
        return [...base_errors, ...argument_errors]
    }

    if ('or' in statement) {
        const base_errors = validate(
            {
                type: 'object',
                properties: {
                    or: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'object' }
                    }
                },
                required: ['or']
            },
            path,
            statement
        )
        const argument_errors =
            statement?.or?.flatMap?.((arg, i) =>
                validate_where({
                    orma_schema,
                    statement: arg,
                    aliases_by_table,
                    path: [...path, 'or', i],
                    table_name
                })
            ) ?? []
        return [...base_errors, ...argument_errors]
    }

    throw new Error('Unrecognized where clause.')
}

export type Where<
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
> =
    | {
          readonly eq:
              | readonly [
                    Expression<Schema, Aliases, Table>,
                    Expression<Schema, Aliases, Table>
                ]
              | readonly [
                    readonly Expression<Schema, Aliases, Table>[],
                    readonly Expression<Schema, Aliases, Table>[]
                ]
      }
    | {
          readonly gt: readonly [
              Expression<Schema, Aliases, Table>,
              Expression<Schema, Aliases, Table>
          ]
      }
    | {
          readonly lt: readonly [
              Expression<Schema, Aliases, Table>,
              Expression<Schema, Aliases, Table>
          ]
      }
    | {
          readonly gte: readonly [
              Expression<Schema, Aliases, Table>,
              Expression<Schema, Aliases, Table>
          ]
      }
    | {
          readonly lte: readonly [
              Expression<Schema, Aliases, Table>,
              Expression<Schema, Aliases, Table>
          ]
      }
    | {
          readonly like: readonly [
              Expression<Schema, Aliases, Table>,
              Expression<Schema, Aliases, Table>
          ]
      }
    | {
          readonly in:
              | readonly [
                    Expression<Schema, Aliases, Table>,
                    (
                        | readonly Expression<Schema, Aliases, Table>[]
                        | Select<Schema, Aliases>
                    )
                ]
              | readonly [
                    Expression<Schema, Aliases, Table>[],
                    readonly Expression<Schema, Aliases, Table>[][]
                ]
      }
    | {
          readonly exists: Select<Schema, Aliases>
      }
    | {
          readonly not: Where<Schema, Aliases, Table>
      }
    | {
          readonly and: readonly Where<Schema, Aliases, Table>[]
      }
    | {
          readonly or: readonly Where<Schema, Aliases, Table>[]
      }
