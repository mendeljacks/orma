import { Pluck } from './helper_types'

{
    type test = Pluck<{ a: 1; b: 2; c: 3 }, 'a' | 'c'>

    type test3 = Record<string, any>
    type test2 = Exclude<keyof test3, number>
}
