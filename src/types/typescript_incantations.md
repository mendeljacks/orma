Typescript is a mysterious language, filled with strange, inconsistent syntax, unintuitive hacks and even bugs! Because typescript
doesn't support higher-order types, we can never truly abstract away the strangeness. Instead, here are some magical incantations 
which use typescript hacks to do what should be simple programming tasks. This can be used as a reference in developing
future types or to understand the spaghetti that is the orma type system.

 - typescript doesnt use standard programming terms, so here is a terminology mapping:
    - a union is a set. So {1, 2, 3} <=> 1 | 2 | 3 in typescript
    - objects and arrays can still be used regularly
    - functions <=> generic types
    
 - map and filter over unions:

// for map and filter, its important that the union type is a simple variable, not computed from a generic or something.
// If you need to map or filter over a generic type result, then use intermediate variables via a separately defined function
// as shown later on
type Map<Items: T> = 
    Items extends T // important to do extends T and not extends any, so typescript doesnt simplify types, e.g. 'literal string' becomes any
    ? MapFunction<T> // ternary operators map over unions which is why this works
    : never // use never, not any. This shouldnt matter in a pure 1-1 mapping, but its consitent with filtering

type Filter<Items: T> =
    IsEqual<Items, SomeOtherType> extends True // in this case equality filtering is used, but the condition can be anything
    ? Items // filter returns the input type if true
    : never // this has to be never, since AnyTime | never = AnyTime when its simplified

 - Defining intermediate variables in a generic type: create more intermediate types

type GetItems<T> = [T, 2, 3] // generate items
type FilterItems<T> = FilterItems2<T, GetItems<T>>
type FilterItems2<T, Items extends GetItems<T>> = 
    IsEqual<Items, SomeOtherType> extends True
    ? Items
    : never

 - Multiple function outputs - use an object or tuple

type Fn<A, B> = { a: A, b: B}

type T = Fn<1, 2>['a'] // T = 1

 - infer specific types
// usually typescript infers general types such as
const a = ['hello'] // a is inferred to be a string[]

// specific types can be inferred using const
const a = ['hello'] as const // a is now inferred to be type readonly ['hello']

// if you want to infer specific types without making it const, then the only way is using a function.
// This has the disadvantages of making your type system a runtime dependency (i.e. potential code bloat for
// your users) and also is very ugly and hacky, but typescript requires it.
const typed_fn = <T extends string[]>(input: T) => input

// a is now inferred to be type ['hello']. Note that there is no readonly as in the const case.
// Also, ['hello'] must be passed directly into the function for this to work (not stored in another variable first)
const a = typed_fn(['hello'])