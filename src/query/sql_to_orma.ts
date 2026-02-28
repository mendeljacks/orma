/**
 * Converts raw SQL strings into orma query or mutation objects.
 *
 * This module parses SQL using node-sql-parser and produces flat (non-nested)
 * orma JSON objects that yield the same SQL results. It does NOT reconstruct
 * nesting, $guids, or operation cascading — just functionally equivalent orma objects.
 *
 * @module sql_to_orma
 */

import { Parser } from 'node-sql-parser'
import { SupportedDatabases } from '../types/schema/schema_types'

// ─── SQL Function Name → Orma Key ───────────────────────────────────────────

const sql_function_to_orma: Record<string, string> = {
    SUM: '$sum',
    MIN: '$min',
    MAX: '$max',
    AVG: '$avg',
    COUNT: '$count',
    COALESCE: '$coalesce',
    ROUND: '$round',
    FLOOR: '$floor',
    CEIL: '$ceil',
    LOWER: '$lower',
    UPPER: '$upper',
    DATE: '$date',
    IF: '$if',
    CONCAT: '$concat',
    GROUP_CONCAT: '$group_concat',
    CAST_SIGNED: '$cast_signed',
    ST_DISTANCE: '$st_distance',
    ST_DWITHIN: '$st_dwithin',
    CURRENT_TIMESTAMP: '$current_timestamp',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const get_parser = (database_type?: SupportedDatabases): Parser => {
    return new Parser()
}

const get_parser_database = (
    database_type?: SupportedDatabases
): string => {
    if (database_type === 'postgres') return 'PostgreSQL'
    // node-sql-parser uses 'MySQL' for both mysql and sqlite
    return 'MySQL'
}

/**
 * Convert a node-sql-parser expression AST node into an orma expression.
 * This is the core recursive conversion function used by both queries and mutations.
 */
const convert_expression = (expr: any): any => {
    if (!expr) return undefined

    // Literal values → {$escape: value}
    if (expr.type === 'number') {
        return { $escape: expr.value }
    }

    if (expr.type === 'single_quote_string' || expr.type === 'string') {
        return { $escape: expr.value }
    }

    if (expr.type === 'double_quote_string') {
        return { $escape: expr.value }
    }

    if (expr.type === 'bool') {
        return { $escape: expr.value }
    }

    if (expr.type === 'null') {
        return { $escape: null }
    }

    // Column reference → field name string (or $entity/$field for table.column)
    if (expr.type === 'column_ref') {
        if (expr.table) {
            return { $entity: expr.table, $field: expr.column }
        }
        return expr.column
    }

    // Star → '*'
    if (expr.type === 'star') {
        return '*'
    }

    // Binary expressions → orma operators
    if (expr.type === 'binary_expr') {
        return convert_binary_expr(expr)
    }

    // Unary expressions (e.g. NOT, -)
    if (expr.type === 'unary_expr') {
        if (expr.operator === 'NOT') {
            return { $not: convert_expression(expr.expr) }
        }
        if (expr.operator === '-') {
            // Negative number
            const inner = convert_expression(expr.expr)
            if (inner && inner.$escape !== undefined) {
                return { $escape: -inner.$escape }
            }
            return { $escape: expr }
        }
        return convert_expression(expr.expr)
    }

    // EXISTS subquery
    if (expr.type === 'unary_expr' && expr.operator === 'EXISTS') {
        return { $exists: convert_select_ast(expr.expr.ast || expr.expr) }
    }

    // Aggregate functions (COUNT, SUM, etc.)
    if (expr.type === 'aggr_func') {
        return convert_aggr_func(expr)
    }

    // Regular functions
    if (expr.type === 'function') {
        return convert_function(expr)
    }

    // Subquery (used in IN, EXISTS, etc.)
    if (expr.type === 'select' || (expr.ast && expr.ast.type === 'select')) {
        const ast = expr.ast || expr
        return convert_select_ast(ast)
    }

    // Expression list (e.g. IN (1, 2, 3))
    if (expr.type === 'expr_list') {
        return (expr.value || []).map(convert_expression)
    }

    // Parameter / placeholder
    if (expr.type === 'param') {
        return { $escape: expr.value }
    }

    // CASE expression — convert to $if where possible
    if (expr.type === 'case') {
        return convert_case_expr(expr)
    }

    // BETWEEN → $and with $gte and $lte
    if (expr.type === 'binary_expr' && expr.operator === 'BETWEEN') {
        return {
            $and: [
                { $gte: [convert_expression(expr.left), convert_expression(expr.right.value[0])] },
                { $lte: [convert_expression(expr.left), convert_expression(expr.right.value[1])] },
            ],
        }
    }

    // Interval (pass through as escape)
    if (expr.type === 'interval') {
        return { $escape: expr.value }
    }

    // Fallback — return raw value if primitive
    if (typeof expr === 'string' || typeof expr === 'number' || typeof expr === 'boolean') {
        return expr
    }

    // Unknown node type — wrap as escape
    return { $escape: expr.value ?? expr }
}

/**
 * Convert a binary expression to the corresponding orma operator.
 */
const convert_binary_expr = (expr: any): any => {
    const left = convert_expression(expr.left)
    const right_node = expr.right

    const operator = expr.operator?.toUpperCase?.() ?? expr.operator

    switch (operator) {
        case '=':
            return { $eq: [left, convert_expression(right_node)] }
        case '!=':
        case '<>':
            return { $not: { $eq: [left, convert_expression(right_node)] } }
        case '>':
            return { $gt: [left, convert_expression(right_node)] }
        case '<':
            return { $lt: [left, convert_expression(right_node)] }
        case '>=':
            return { $gte: [left, convert_expression(right_node)] }
        case '<=':
            return { $lte: [left, convert_expression(right_node)] }
        case 'LIKE':
            return { $like: [left, convert_expression(right_node)] }
        case 'NOT LIKE':
            return { $not: { $like: [left, convert_expression(right_node)] } }
        case 'IN': {
            const right_val = convert_in_right(right_node)
            return { $in: [left, right_val] }
        }
        case 'NOT IN': {
            const right_val = convert_in_right(right_node)
            return { $not: { $in: [left, right_val] } }
        }
        case 'AND':
            return { $and: [left, convert_expression(right_node)] }
        case 'OR':
            return { $or: [left, convert_expression(right_node)] }
        case 'IS': {
            // IS NULL
            if (right_node?.type === 'null' || right_node?.value === null) {
                return { $eq: [left, { $escape: null }] }
            }
            return { $eq: [left, convert_expression(right_node)] }
        }
        case 'IS NOT': {
            // IS NOT NULL
            if (right_node?.type === 'null' || right_node?.value === null) {
                return { $not: { $eq: [left, { $escape: null }] } }
            }
            return { $not: { $eq: [left, convert_expression(right_node)] } }
        }
        case 'BETWEEN': {
            // BETWEEN a AND b → $and: [$gte: [col, a], $lte: [col, b]]
            const range_right = right_node
            return {
                $and: [
                    { $gte: [left, convert_expression(range_right.value?.[0] ?? range_right)] },
                    { $lte: [left, convert_expression(range_right.value?.[1] ?? range_right)] },
                ],
            }
        }
        case 'NOT BETWEEN': {
            const range_right = right_node
            return {
                $or: [
                    { $lt: [left, convert_expression(range_right.value?.[0] ?? range_right)] },
                    { $gt: [left, convert_expression(range_right.value?.[1] ?? range_right)] },
                ],
            }
        }
        case '+':
            return { $add: [left, convert_expression(right_node)] }
        case '-':
            return { $subtract: [left, convert_expression(right_node)] }
        case '*':
            return { $multiply: [left, convert_expression(right_node)] }
        case '/':
            return { $divide: [left, convert_expression(right_node)] }
        default:
            // Fallback: return a raw representation
            return { $eq: [left, convert_expression(right_node)] }
    }
}

/**
 * Convert the right-hand side of an IN expression.
 * Could be a subquery or a list of values.
 */
const convert_in_right = (right_node: any): any => {
    // Subquery: { type: 'select', ... } or { ast: { type: 'select', ... } }
    if (right_node?.ast) {
        return convert_select_ast(right_node.ast)
    }
    if (right_node?.type === 'select') {
        return convert_select_ast(right_node)
    }
    // Expression list — could contain a subquery or plain values
    if (right_node?.type === 'expr_list') {
        const values = right_node.value || []
        // Check if the expr_list contains a single subquery
        if (values.length === 1 && values[0]?.ast?.type === 'select') {
            return convert_select_ast(values[0].ast)
        }
        const converted = values.map(convert_expression)
        // Unwrap $escape values into a single $escape array for orma's $in
        if (converted.every((v: any) => v && v.$escape !== undefined)) {
            return { $escape: converted.map((v: any) => v.$escape) }
        }
        return converted
    }
    return convert_expression(right_node)
}

/**
 * Convert an aggregate function AST node.
 */
const convert_aggr_func = (expr: any): any => {
    const func_name = expr.name?.toUpperCase()
    const orma_key = sql_function_to_orma[func_name]

    if (!orma_key) {
        // Unknown aggregate, just wrap as escape
        return { $escape: expr }
    }

    // Handle COUNT(*)
    if (expr.args?.expr?.type === 'star') {
        return { [orma_key]: '*' }
    }

    // Handle DISTINCT
    if (expr.args?.distinct === 'DISTINCT') {
        const inner_expr = convert_expression(expr.args.expr)
        return { [orma_key]: { $distinct: inner_expr } }
    }

    const args_expr = expr.args?.expr
    if (args_expr) {
        return { [orma_key]: convert_expression(args_expr) }
    }

    return { [orma_key]: '*' }
}

/**
 * Convert a regular function AST node.
 */
const convert_function = (expr: any): any => {
    // Get function name — node-sql-parser stores it as name.name[0].value or just name
    let func_name: string
    if (typeof expr.name === 'string') {
        func_name = expr.name.toUpperCase()
    } else if (expr.name?.name) {
        func_name = expr.name.name
            .map((n: any) => (typeof n === 'string' ? n : n.value))
            .join('_')
            .toUpperCase()
    } else {
        func_name = String(expr.name).toUpperCase()
    }

    // Normalize underscored names like ST_DISTANCE
    const orma_key = sql_function_to_orma[func_name]
    if (!orma_key) {
        // Unknown function — return raw
        return { $escape: expr }
    }

    // No-arg functions like CURRENT_TIMESTAMP
    if (!expr.args || (expr.args.type === 'expr_list' && (!expr.args.value || expr.args.value.length === 0))) {
        return { [orma_key]: [] }
    }

    // Single arg vs multiple args
    const args_list = expr.args?.value || (expr.args?.expr ? [expr.args.expr] : [])
    if (args_list.length === 1) {
        return { [orma_key]: convert_expression(args_list[0]) }
    }

    return { [orma_key]: args_list.map(convert_expression) }
}

/**
 * Convert CASE WHEN ... THEN ... ELSE ... END to orma $if
 */
const convert_case_expr = (expr: any): any => {
    // Simple CASE with one WHEN → $if
    if (expr.args?.length === 1) {
        const when_clause = expr.args[0]
        return {
            $if: [
                convert_expression(when_clause.cond),
                convert_expression(when_clause.result),
                convert_expression(expr.else),
            ],
        }
    }
    // Complex CASE — just return the first branch as $if (best effort)
    if (expr.args?.length > 0) {
        const first = expr.args[0]
        return {
            $if: [
                convert_expression(first.cond),
                convert_expression(first.result),
                convert_expression(expr.else),
            ],
        }
    }
    return { $escape: null }
}

// ─── Flatten $and/$or ────────────────────────────────────────────────────────

/**
 * Flatten nested $and and $or into arrays.
 * SQL parsers produce right-recursive binary trees for AND/OR chains,
 * e.g. a AND (b AND c). We flatten these into {$and: [a, b, c]}.
 */
const flatten_connectives = (expr: any): any => {
    if (!expr || typeof expr !== 'object') return expr

    if (expr.$and) {
        const items = collect_connective('$and', expr)
        return { $and: items.map(flatten_connectives) }
    }
    if (expr.$or) {
        const items = collect_connective('$or', expr)
        return { $or: items.map(flatten_connectives) }
    }
    if (expr.$not) {
        return { $not: flatten_connectives(expr.$not) }
    }

    // Recurse into arrays
    if (Array.isArray(expr)) {
        return expr.map(flatten_connectives)
    }

    // Recurse into objects
    const result: any = {}
    for (const key of Object.keys(expr)) {
        result[key] = flatten_connectives(expr[key])
    }
    return result
}

const collect_connective = (key: '$and' | '$or', node: any): any[] => {
    const items: any[] = []
    const args = Array.isArray(node[key]) ? node[key] : [node[key]]
    for (const arg of args) {
        if (arg && typeof arg === 'object' && arg[key] && !Array.isArray(arg[key]?.[0])) {
            // Same connective — flatten
            items.push(...collect_connective(key, arg))
        } else {
            items.push(arg)
        }
    }
    return items
}

// ─── SELECT → Orma Query ────────────────────────────────────────────────────

/**
 * Convert a parsed SELECT AST to an orma subquery object.
 * This is the internal converter, used recursively for subqueries.
 */
const convert_select_ast = (ast: any): any => {
    const result: any = {}

    // $select + column handling
    if (ast.columns === '*') {
        result.$select = ['*']
    } else if (Array.isArray(ast.columns)) {
        const select_items: any[] = []
        for (const col of ast.columns) {
            select_items.push(convert_select_column(col))
        }
        result.$select = select_items
    }

    // $from
    if (ast.from && ast.from.length > 0) {
        result.$from = ast.from[0].table
    }

    // $where
    if (ast.where) {
        const where_expr = convert_expression(ast.where)
        result.$where = flatten_connectives(where_expr)
    }

    // $group_by
    if (ast.groupby) {
        const group_cols = (ast.groupby.columns || ast.groupby)
        if (Array.isArray(group_cols)) {
            result.$group_by = group_cols.map((g: any) => {
                if (g.type === 'column_ref') return g.column
                if (g.expr) return convert_expression(g.expr)
                return convert_expression(g)
            })
        }
    }

    // $having
    if (ast.having) {
        const having_expr = convert_expression(ast.having)
        result.$having = flatten_connectives(having_expr)
    }

    // $order_by
    if (ast.orderby) {
        result.$order_by = ast.orderby.map((o: any) => {
            const col_expr = convert_expression(o.expr)
            if (o.type === 'DESC') {
                return { $desc: col_expr }
            }
            return { $asc: col_expr }
        })
    }

    // $limit and $offset
    if (ast.limit) {
        const limit_val = ast.limit.value
        if (Array.isArray(limit_val)) {
            // [offset, limit] or [limit]
            if (limit_val.length === 2) {
                if (ast.limit.seperator === 'offset') {
                    result.$limit = limit_val[0]?.value ?? limit_val[0]
                    result.$offset = limit_val[1]?.value ?? limit_val[1]
                } else {
                    // LIMIT offset, count syntax (MySQL)
                    result.$offset = limit_val[0]?.value ?? limit_val[0]
                    result.$limit = limit_val[1]?.value ?? limit_val[1]
                }
            } else if (limit_val.length === 1) {
                result.$limit = limit_val[0]?.value ?? limit_val[0]
            }
        } else if (limit_val !== undefined) {
            result.$limit = limit_val?.value ?? limit_val
        }
    }

    // DISTINCT
    if (ast.distinct === 'DISTINCT') {
        // Wrap the first select in $distinct if applicable
        // Orma handles $distinct as a separate node
        if (result.$select && result.$select.length > 0) {
            const first = result.$select[0]
            if (typeof first === 'string' || (first && !first.$as)) {
                result.$select[0] = { $distinct: first }
            }
        }
    }

    return result
}

/**
 * Convert a single SELECT column into its orma representation.
 */
const convert_select_column = (col: any): any => {
    const expr = convert_expression(col.expr)
    const alias = col.as

    if (alias) {
        return { $as: [expr, alias] }
    }

    return expr
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert a SELECT SQL string into an orma query object.
 *
 * The returned object has the entity name as the top-level key, with field
 * selections and clauses inside. Since the table name is already the key,
 * $from is omitted from the subquery to avoid redundancy.
 *
 * @example
 * ```ts
 * const orma = sql_to_orma_query("SELECT id, name FROM users WHERE id = 1")
 * // {
 * //   users: {
 * //     id: true,
 * //     name: true,
 * //     $where: { $eq: ['id', { $escape: 1 }] }
 * //   }
 * // }
 * ```
 */
export const sql_to_orma_query = (
    sql: string,
    database_type?: SupportedDatabases
): Record<string, any> => {
    const parser = get_parser(database_type)
    const db = get_parser_database(database_type)
    const ast = parser.astify(sql, { database: db })

    // Handle multiple statements
    const asts = Array.isArray(ast) ? ast : [ast]
    const result: Record<string, any> = {}

    for (const statement of asts) {
        if (statement.type !== 'select') {
            throw new Error(
                `sql_to_orma_query only handles SELECT statements. Got: ${statement.type}`
            )
        }

        const subquery = convert_select_ast(statement)
        const entity = subquery.$from
        // Remove $from since the table name is already the key of the result object
        delete subquery.$from

        if (!entity) {
            throw new Error('SELECT statement must have a FROM clause')
        }

        // Convert $select array to orma field shorthand where possible
        const converted = convert_select_to_field_shorthand(subquery)
        result[entity] = converted
    }

    return result
}

/**
 * Convert $select array notation to orma's field shorthand where possible.
 *
 * - Simple field reference 'name' → name: true
 * - Aliased field { $as: ['name', 'alias'] } → alias: 'name' (if simple) or alias: {$fn: 'name'}
 * - Functions stay as $select items
 *
 * Falls back to keeping $select when shorthand isn't possible.
 */
const convert_select_to_field_shorthand = (subquery: any): any => {
    const result: any = {}

    if (!subquery.$select) {
        return subquery
    }

    let can_use_shorthand = true
    const shorthand_fields: Record<string, any> = {}
    const complex_selects: any[] = []

    for (const item of subquery.$select) {
        if (typeof item === 'string') {
            // Simple field reference → field: true
            if (item === '*') {
                // SELECT * — can't easily convert to shorthand
                can_use_shorthand = false
                complex_selects.push(item)
            } else {
                shorthand_fields[item] = true
            }
        } else if (item?.$as) {
            const [expr, alias] = item.$as
            if (typeof expr === 'string' && typeof alias === 'string') {
                // Simple rename: SELECT field AS alias → alias: 'field'
                shorthand_fields[alias] = expr
            } else if (typeof alias === 'string') {
                // Function or complex expression with alias
                shorthand_fields[alias] = expr
            } else {
                can_use_shorthand = false
                complex_selects.push(item)
            }
        } else if (item?.$distinct) {
            // Keep as complex
            can_use_shorthand = false
            complex_selects.push(item)
        } else if (typeof item === 'object') {
            // Function reference without alias — need $select
            can_use_shorthand = false
            complex_selects.push(item)
        } else {
            can_use_shorthand = false
            complex_selects.push(item)
        }
    }

    if (can_use_shorthand && complex_selects.length === 0) {
        // Use shorthand notation
        Object.assign(result, shorthand_fields)
    } else {
        // Mix: put simple fields as shorthand, keep complex as $select
        if (Object.keys(shorthand_fields).length > 0 && complex_selects.length > 0) {
            // Can't mix shorthand and $select cleanly, use $select for all
            result.$select = subquery.$select
        } else if (complex_selects.length > 0) {
            result.$select = subquery.$select
        } else {
            Object.assign(result, shorthand_fields)
        }
    }

    // Copy non-$select clauses
    if (subquery.$from) result.$from = subquery.$from
    if (subquery.$where) result.$where = subquery.$where
    if (subquery.$group_by) result.$group_by = subquery.$group_by
    if (subquery.$having) result.$having = subquery.$having
    if (subquery.$order_by) result.$order_by = subquery.$order_by
    if (subquery.$limit !== undefined) result.$limit = subquery.$limit
    if (subquery.$offset !== undefined) result.$offset = subquery.$offset

    return result
}

/**
 * Convert an INSERT, UPDATE, or DELETE SQL string into an orma mutation object.
 *
 * Returns a user-facing mutation format:
 * ```
 * { entity_name: [{ $operation: 'create'|'update'|'delete', field: value, ... }] }
 * ```
 *
 * @example
 * ```ts
 * const orma = sql_to_orma_mutation("INSERT INTO users (name, email) VALUES ('Alice', 'a@a.com')")
 * // {
 * //   users: [{
 * //     $operation: 'create',
 * //     name: 'Alice',
 * //     email: 'a@a.com'
 * //   }]
 * // }
 * ```
 */
export const sql_to_orma_mutation = (
    sql: string,
    database_type?: SupportedDatabases
): Record<string, any[]> => {
    const parser = get_parser(database_type)
    const db = get_parser_database(database_type)
    const ast = parser.astify(sql, { database: db })

    // Handle multiple statements
    const asts = Array.isArray(ast) ? ast : [ast]
    const result: Record<string, any[]> = {}

    for (const statement of asts) {
        switch (statement.type) {
            case 'insert':
                merge_mutation_result(result, convert_insert(statement))
                break
            case 'update':
                merge_mutation_result(result, convert_update(statement))
                break
            case 'delete':
                merge_mutation_result(result, convert_delete(statement))
                break
            default:
                throw new Error(
                    `sql_to_orma_mutation only handles INSERT, UPDATE, DELETE statements. Got: ${statement.type}`
                )
        }
    }

    return result
}

/**
 * Merge mutation results from multiple statements.
 */
const merge_mutation_result = (
    target: Record<string, any[]>,
    source: Record<string, any[]>
) => {
    for (const [entity, records] of Object.entries(source)) {
        if (!target[entity]) {
            target[entity] = []
        }
        target[entity].push(...records)
    }
}

// ─── INSERT ──────────────────────────────────────────────────────────────────

const convert_insert = (ast: any): Record<string, any[]> => {
    const table = ast.table?.[0]?.table
    if (!table) throw new Error('INSERT statement must specify a table')

    const columns: string[] = ast.columns || []
    const values_container = ast.values

    const records: any[] = []

    if (values_container) {
        // node-sql-parser format: { type: 'values', values: [{ type: 'expr_list', value: [...] }, ...] }
        const rows = values_container.type === 'values'
            ? values_container.values
            : Array.isArray(values_container) ? values_container : [values_container]

        for (const row of rows) {
            // Each row is { type: 'expr_list', value: [...] }
            const value_items = row.value || row
            const record: any = { $operation: 'create' }

            if (Array.isArray(value_items)) {
                for (let i = 0; i < columns.length && i < value_items.length; i++) {
                    const val = value_items[i]
                    record[columns[i]] = extract_literal_value(val)
                }
            }

            records.push(record)
        }
    }

    return { [table]: records }
}

// ─── UPDATE ──────────────────────────────────────────────────────────────────

const convert_update = (ast: any): Record<string, any[]> => {
    const table = ast.table?.[0]?.table
    if (!table) throw new Error('UPDATE statement must specify a table')

    const record: any = { $operation: 'update' }

    // SET clauses
    if (ast.set) {
        for (const set_item of ast.set) {
            const column = set_item.column
            const value = extract_literal_value(set_item.value)
            record[column] = value
        }
    }

    // WHERE clause — extract identifying fields
    if (ast.where) {
        const where_fields = extract_where_fields(ast.where)
        Object.assign(record, where_fields)
    }

    return { [table]: [record] }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

const convert_delete = (ast: any): Record<string, any[]> => {
    const table = ast.from?.[0]?.table || ast.table?.[0]?.table
    if (!table) throw new Error('DELETE statement must specify a table')

    const record: any = { $operation: 'delete' }

    // WHERE clause — extract identifying fields
    if (ast.where) {
        const where_fields = extract_where_fields(ast.where)
        Object.assign(record, where_fields)
    }

    return { [table]: [record] }
}

// ─── Mutation Helpers ────────────────────────────────────────────────────────

/**
 * Extract a literal value from a node-sql-parser value node.
 * For mutations we want plain values, not {$escape: value}.
 */
const extract_literal_value = (node: any): any => {
    if (!node) return null

    if (node.type === 'number') return node.value
    if (node.type === 'single_quote_string' || node.type === 'string') return node.value
    if (node.type === 'double_quote_string') return node.value
    if (node.type === 'bool') return node.value
    if (node.type === 'null') return null

    // For complex expressions, return the value
    if (node.value !== undefined) return node.value

    return node
}

/**
 * Extract simple equality fields from a WHERE clause for mutations.
 * For UPDATE/DELETE, the WHERE clause identifies which record(s) to modify.
 * We extract simple equalities (field = value) into flat fields.
 *
 * For complex WHERE clauses, we still extract what we can.
 */
const extract_where_fields = (where: any): Record<string, any> => {
    const fields: Record<string, any> = {}

    if (!where) return fields

    // Simple equality: field = value
    if (where.type === 'binary_expr' && where.operator === '=') {
        const left = where.left
        const right = where.right
        if (left?.type === 'column_ref' && !left.table) {
            fields[left.column] = extract_literal_value(right)
        }
        return fields
    }

    // AND of equalities
    if (where.type === 'binary_expr' && where.operator === 'AND') {
        Object.assign(fields, extract_where_fields(where.left))
        Object.assign(fields, extract_where_fields(where.right))
        return fields
    }

    return fields
}
