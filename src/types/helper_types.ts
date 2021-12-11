type ValuesOf<O> = O extends any ? O[keyof O] : never

/**
 * identity function which returns first param, but only allows the first param to be the type of the second param
*/
export type AllowType<T extends U, U> = T

export type IsType<T, U> = T extends U ? T : never