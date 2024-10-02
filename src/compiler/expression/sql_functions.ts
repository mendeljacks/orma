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
    cast_signed: {
        ast_to_sql: args => `CAST(({args}) AS SIGNED)`,
        min_args: 1,
        max_args: 1
    },
    sum: {
        ast_to_sql: args => `SUM({wrap_if_subquery(args)})`,
        aggregate: true,
        allow_distinct: true,
        min_args: 1,
        max_args: 1
    },
    min: {
        ast_to_sql: args => `MIN({wrap_if_subquery(args)})`,
        aggregate: true,
        allow_distinct: true,
        min_args: 1,
        max_args: 1
    },
    max: {
        ast_to_sql: args => `MAX({wrap_if_subquery(args)})`,
        aggregate: true,
        allow_distinct: true,
        min_args: 1,
        max_args: 1
    },
    avg: {
        ast_to_sql: args => `AVG({wrap_if_subquery(args)})`,
        aggregate: true,
        allow_distinct: true,
        min_args: 1,
        max_args: 1
    },
    count: {
        ast_to_sql: args => `COUNT({wrap_if_subquery(args)})`,
        aggregate: true,
        allow_distinct: true,
        allow_star: true,
        min_args: 1,
        max_args: 1
    },
    // non-aggregate functions
    coalesce: {
        ast_to_sql: (args, path) => {
            const res = `COALESCE({args.map(arg => wrap_if_subquery(arg)).join(', ')})`
            return nested_under_odd_nots(path) ? `NOT ({res})` : res
        },
        min_args: 1
    },
    round: {
        ast_to_sql: args => `ROUND({args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        min_args: 2,
        max_args: 2
    },
    floor: {
        ast_to_sql: args => `FLOOR({wrap_if_subquery(args)})`,
        min_args: 1,
        max_args: 1
    },
    ceil: {
        ast_to_sql: args => `CEIL({wrap_if_subquery(args)})`,
        min_args: 1,
        max_args: 1
    },
    lower: {
        ast_to_sql: args => `LOWER({wrap_if_subquery(args)})`,
        min_args: 1,
        max_args: 1
    },
    upper: {
        ast_to_sql: args => `UPPER({wrap_if_subquery(args)})`,
        min_args: 1,
        max_args: 1
    },
    date: {
        ast_to_sql: args => `DATE({wrap_if_subquery(args)})`,
        min_args: 1,
        max_args: 1
    },
    if: {
        ast_to_sql: args => `IF({args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        min_args: 3,
        max_args: 3
    },
    concat: {
        ast_to_sql: args => `CONCAT({args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        min_args: 1
    },
    group_concat: {
        ast_to_sql: args => `GROUP_CONCAT({args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        aggregate: true,
        min_args: 1
    },
    multiply: {
        ast_to_sql: args => `({args.map(arg => wrap_if_subquery(arg)).join(' * ')})`,
        min_args: 2,
        max_args: 2
    },
    divide: {
        ast_to_sql: args => `({args.map(arg => wrap_if_subquery(arg)).join(' / ')})`,
        min_args: 2,
        max_args: 2
    },
    add: {
        ast_to_sql: args => `({args.map(arg => wrap_if_subquery(arg)).join(' + ')})`,
        min_args: 2,
        max_args: 2
    },
    subtract: {
        ast_to_sql: args => `({args.map(arg => wrap_if_subquery(arg)).join(' - ')})`,
        min_args: 2,
        max_args: 2
    },
    // Postgres's PostGIS functions
    st_distance: {
        ast_to_sql: args => `ST_Distance({args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        min_args: 2,
        max_args: 3
    },
    st_dwithin: {
        ast_to_sql: args => `ST_DWithin({args.map(arg => wrap_if_subquery(arg)).join(', ')})`,
        min_args: 2,
        max_args: 3
    },
    current_timestamp: {
        ast_to_sql: arg => `CURRENT_TIMESTAMP`,
        max_args: 0
    }
} as const satisfies SqlFunctionDefinitions