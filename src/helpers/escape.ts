import { escape } from 'sqlstring'
import * as pg_escape from 'pg-escape-browser'
import { SupportedDbs } from '../introspector/introspector'

/**
 * Small wrapper over sqlstring escape to prevent sqlstring from casting numbers into strings
 * (which it does for some reason)
 */
export const orma_escape = (val: any, database_type: SupportedDbs) => {
    const escape_fn =
        database_type === 'mysql'
            ? val => escape(val, true, '+00')
            : typeof val === 'object'
            ? el => el
            : pg_escape.literal

    return typeof val === 'number' ? val : escape_fn(val)
}
