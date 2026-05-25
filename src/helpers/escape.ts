import { escape as escape_mysql } from 'sqlstring'
import { escape as escape_sqlite } from 'sqlstring-sqlite'
import * as pg_escape from 'pg-escape-browser'
import { SupportedDatabases } from '../types/schema/schema_types'
import { is_simple_object } from './helpers'

/**
 * Wraps database-specific escape functions with type-aware handling so that
 * primitives like numbers and booleans don't blow up in escape functions that
 * only expect strings (e.g. pg_escape.literal calling val.indexOf).
 */
export const orma_escape = (val: any, database_type: SupportedDatabases) => {
    // Booleans: emit proper SQL literals per dialect
    if (typeof val === 'boolean') {
        if (database_type === 'sqlite') return val ? 1 : 0 // sqlite has no native bool
        return val ? 'TRUE' : 'FALSE' // postgres / mysql
    }

    // guids could get in here, dont escape them. Note other object-like things such as 
    // Dates and arrays be parsed.
    const dont_parse =
        typeof val === 'number' || is_simple_object(val)

    if (dont_parse) return val

    const escape_fn = {
        mysql: val => escape_mysql(val, true, '+00'),
        sqlite: val => escape_sqlite(val, true, '+00'),
        postgres: pg_escape.literal,
    }[database_type]

    return escape_fn(val)
}
