// interface query {
//     meta: query_meta
//     [entity_name: string]: query | query_meta
// }

// interface query_meta {
//     select: select
//     distinct?: boolean
//     from?: string
//     where?: where
//     group_by?: string[]
//     order_by?: {
//         asc: string
//         desc: string
//     }[]
//     limit?: number
//     offset?: number
// }

// type select = (string | expression)[]

// type expression = {
//     or: expression[]
// } | {
//     and: expression[]
// } | {
//     xor: expression[]
// } | {
//     not: expression
// } | boolean_primary

// type boolean_primary = {
//     eq: [expression, expression] 
// } | {
//     [operator in comparison_operator]: [boolean_primary, predicate]
// } | (
//     {
//         [operator in comparison_operator]: [boolean_primary, query]
//     } & { all: boolean }
// ) | (
//     {
//         [operator in comparison_operator]: [boolean_primary, query]
//     } & { any: boolean }
// ) | predicate

// // handle not eq separately // // use <=> which gives null-safety, not =. for not equal, use <> instead of != since <> is standard sql
// type comparison_operator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' 

// type predicate = {
//     in: [bit_expression, query]
// } | {
//     not: {
//         in: [bit_expression, query]
//     }
// } | {
//     in: [bit_expression, expression[]]
// } | {
//     not: {
//         in: [bit_expression, expression[]]
//     }
// } | {
//     between: [bit_expression, bit_expression, predicate]
// } | {
//     not: {
//         between: [bit_expression, bit_expression, predicate]
//     }
// } | {
//     like: [bit_expression, simple_expression]
// } | {
//     not: {
//         like: [bit_expression, simple_expression]
//     }
// } | {
//     regexp: [bit_expression, bit_expression]
// } | {
//     not: {
//         regexp: [bit_expression, bit_expression]
//     }
// }

// type bit_expression = {
//     [operation in bit_expressions]: [bit_expression, bit_expression]
// }

// type bit_expressions = 'bit_or' | 'bit_and' | 'bit_left_shift' | 'bit_right_shift' | 'add' | 'subtract' | 'multiply' | 'divide' | 'mod' | 'bit_xor' 

// type simple_expression = literal | {
//     identifier: string
// } | {
//     [function_name in functions]: expression
// } | {
//     exists: query
// }

// type functions = 'add'

// type literal = string 
//     | number 
//     | Date 
//     | { hex: string } 
//     | { bit: string } 
//     | boolean 
//     | null 
//     | { minus: literal } 
//     | query // should be single-value query




// interface where {
//     eq: operation
//     gt: operation
//     lt: operation
//     gte: operation
//     lte: operation
//     in: [string, primitive[]]
//     like: operation
//     not: where
//     and: where[]
//     or: where[]
// }

// type operation = [string, primitive]

// type primitive = string | number | Date

type select_expr = {

}

type unary_function = {
    ascii: string | field
} | {
    bin: number | field
} | {
    bit_length: string | field
} | {
    char: (number | field)[]
} | {
    character_length: string | field
} | {
    concat: (string | field)[]
} | {
    concat_ws: (string | field)[]
}



// type string_like = {
//     ascii: string | field
// } | {
//     bin: number | field
// } | {
//     bit_length: string | field
// } | {
//     char: (number | field)[]
// } | {
//     character_length: string | field
// } | {
//     concat: (string | field)[]
// } | {
//     concat_ws: (string | field)[]
// } | {

// }


type string_like = string | Date | number | { field: string } | {
    ascii: string_like
} | {
    bin: number_like
} | {
    char: number_like[]
} | {
    character_length: string_like
} | {
    concat: string_like[]
} | {
    concat_ws: string_like[]
} | {
    elt: string_like[] // actually 2 or more elements
} | {

}

type number_like = string | Date | number | { field: string } | {

}

type literal = string_literal 
    | number 
    | Date 
    | { hex: string } 
    | { bit: string }
    | boolean 
    | null

type string_literal = string | { field: string }

type field = { field: string }