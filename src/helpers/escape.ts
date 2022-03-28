import { escape } from 'sqlstring'

/**
 * Small wrapper over sqlstring escape to prevent sqlstring from casting numbers into strings 
 * (which it does for some reason)
 */
export const orma_escape = (val: any) => {
    return typeof val === 'number' ? val : escape(val)
}