type ValuesOf<O> = O extends any ? O[keyof O] : never

/**
 * identity function which returns first param, but only allows the first param to be the type of the second param
 */
export type AllowType<T extends U, U> = T

export type IsType<T, U> = T extends U ? T : never

/**
 * Takes an object type and picks out the values based on the desired keys
 */
export type Pluck<
    Obj extends Record<string, any>,
    DesiredKeys extends string
> = PluckKey<Obj, Extract<keyof Obj, string>, DesiredKeys>

type PluckKey<
    Obj extends Record<string, any>,
    Keys extends string,
    DesiredKeys extends string
> = Keys extends DesiredKeys ? Obj[Keys] : never

// export type AllowEqual<T1 extends T2, T2> = AllowEqual2<T1, T2>
// export type IsEqual<T1, T2> = T1 extends T2
//     ? T2 extends T1
//         ? true
//         : false
//     : false

// check type equality. IsStrictEqual<any, string> = false
export type IsEqual<T, U> = (<G>() => G extends T ? 1 : 2) extends <
    G
>() => G extends U ? 1 : 2
    ? true
    : false

export type IsExtends<T, U> = T extends U ? true : false

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
    k: infer I
) => void
    ? I
    : never

export type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true

// from: https://stackoverflow.com/questions/57683303/how-can-i-see-the-full-expanded-contract-of-a-typescript-type
export type Expand<T> = T extends (...args: infer A) => infer R
    ? (...args: Expand<A>) => Expand<R>
    : T extends infer O
    ? { [K in keyof O]: O[K] }
    : never

export type ExpandRecursively<T> = T extends (...args: infer A) => infer R
    ? (...args: ExpandRecursively<A>) => ExpandRecursively<R>
    : T extends Object
    ? T extends infer O
        ? { [K in keyof O]: ExpandRecursively<O[K]> }
        : never
    : T

export type BooleanOr<A extends boolean, B extends boolean> = true extends A | B
    ? true
    : false

export type LowercaseChar =
    | 'a'
    | 'b'
    | 'c'
    | 'd'
    | 'e'
    | 'f'
    | 'g'
    | 'h'
    | 'i'
    | 'j'
    | 'k'
    | 'l'
    | 'm'
    | 'n'
    | 'o'
    | 'p'
    | 'q'
    | 'r'
    | 's'
    | 't'
    | 'u'
    | 'v'
    | 'w'
    | 'x'
    | 'y'
    | 'z'

export type UppercaseChar =
    | 'A'
    | 'B'
    | 'C'
    | 'D'
    | 'E'
    | 'F'
    | 'G'
    | 'H'
    | 'I'
    | 'J'
    | 'K'
    | 'L'
    | 'M'
    | 'N'
    | 'O'
    | 'P'
    | 'Q'
    | 'R'
    | 'S'
    | 'T'
    | 'U'
    | 'V'
    | 'W'
    | 'X'
    | 'Y'
    | 'Z'

export type NumericChar =
    | '1'
    | '2'
    | '3'
    | '4'
    | '5'
    | '6'
    | '7'
    | '8'
    | '9'
    | '0'
