import { escape as escape_mysql } from 'sqlstring'
import { escape as escape_sqlite } from 'sqlstring-sqlite'
import * as pg_escape from 'pg-escape-browser'
import { SupportedDatabases } from '../schema/schema_types'
import { is_simple_object } from './helpers'

/**
 * Small wrapper over sqlstring escape to prevent sqlstring from casting numbers into strings
 * (which it does for some reason)
 */
export const escape_value = (database_type: SupportedDatabases, val: any) => {
    // guids could get in here, dont escape them. Note other object-like things such as
    // dates and arrays should be parsed. Also dont cast numbers to strings (helpful for working with
    // data in code)
    if (typeof val === 'number' || is_simple_object(val)) {
        return val
    }

    if (database_type === 'mysql') {
        return escape_mysql(val, true, '+00')
    }

    if (database_type === 'postgres') {
        return pg_escape.literal(val)
    }

    if (database_type === 'sqlite') {
        return escape_sqlite(val, true, '+00')
    }

    throw new Error(
        'Escape value not implemented for data base type ' + database_type
    )
}

/**
 * Wrap column name in escape string. Does not escape things like quotes in the identifier,
 * since identifiers already must match something in the schema like a column or table name
 */
export const escape_identifier = (
    database_type: SupportedDatabases,
    val: any
) => {
    if (typeof val !== 'string') {
        return val
    }
    if (val === '*') {
        return val
    }

    if (!pg_escape.validIdent(val)) {
        throw new Error(
            `Invalid identifier ${val}. Identifiers must be alphanumeric and not start with a number.`
        )
    }

    return database_type === 'postgres' ? `"${val}"` : `\`${val}\``
}
