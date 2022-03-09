Typescript is a mysterious language, filled with strange, inconsistent syntax, unintuitive hacks and even bugs! Because typescript
doesn't support higher-order types, we can never truly abstract away the strangeness. Instead, here are some magical incantations 
which use typescript hacks to do simple programming tasks

 - typescript doesnt use standard programming concepts, so here is aterminology mapping:
    - consider a union as a set. So {1, 2, 3} <=> 1 | 2 | 3 in typescript
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