import { expect } from 'chai'
import { describe, test } from 'mocha'
import { format } from 'sql-formatter'
import { compile_expression, Expression } from './compile_expression'
import {
    global_test_schema,
    GlobalTestAliases,
    GlobalTestSchema
} from '../../test_data/global_test_schema'

describe('expression_compiler.ts', () => {
    // test('handles column expressions', () => {
    //     // const json: Expression<GlobalTestSchema, GlobalTestAliases, 'posts'> =
    //     //     'my_title'

    //     const { sql, warnings, errors } = compile_expression(
    //         global_test_schema,
    //         {},
    //         'allow_aggregates',
    //         'posts',
    //         'my_title'
    //     )

    //     const sql = format()
    //     const goal = format(`my_title`)

    //     expect(sql).to.equal(goal)
    // })
    // test('handles column expressions', () => {
    //     const json: Expression<GlobalTestSchema, GlobalTestAliases, 'posts'> =
    //         'my_title'

    //     const sql = format(json_to_sql(json))
    //     const goal = format(`SELECT a FROM \`b\``)

    //     expect(sql).to.equal(goal)
    // })
})
