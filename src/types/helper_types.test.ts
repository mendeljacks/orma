import { BooleanOr, Pluck } from './helper_types'

{
    type test = Pluck<{ a: 1; b: 2; c: 3 }, 'a' | 'c'>

    type test3 = Record<string, any>
    type test2 = Exclude<keyof test3, number>
}

{
    const test1: BooleanOr<true, true> = true
    const test2: BooleanOr<true, false> = true
    const test3: BooleanOr<false, false> = false
}