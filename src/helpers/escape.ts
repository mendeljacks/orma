import { escape as escape_mysql } from 'sqlstring'
import { escape as escape_sqlite } from 'sqlstring-sqlite'
import * as pg_escape from 'pg-escape-browser'
import { SupportedDatabases } from '../schema/schema_types'
import { is_simple_object } from './helpers'

/**
 * Small wrapper over sqlstring escape to prevent sqlstring from casting numbers into strings
 * (which it does for some reason)
 */
export const orma_escape = (val: any, database_type: SupportedDatabases) => {
    const parse_functions = {
        mysql: val => escape_mysql(val, true, '+00'),
        sqlite: val => escape_sqlite(val, true, '+00'),
        postgres: pg_escape.literal,
    }

    const escape_fn = parse_functions[database_type]

    // guids could get in here, dont escape them. Note other object-like things such as 
    // Dates and arrays should be parsed.
    const dont_parse =
        typeof val === 'number' || is_simple_object(val)

    return dont_parse ? val : escape_fn(val)
}

export const escape_column = (val, database_type: SupportedDatabases) => {
    if (typeof val !== 'string') {
        return val
    }
    if (['*'].includes(val)) {
        return val
    }

    return database_type === 'postgres' ? `"${val}"` : `\`${val}\``
}