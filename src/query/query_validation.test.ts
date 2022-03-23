import Ajv from 'ajv'
import { describe, test } from 'mocha'
import { OrmaQuery } from '../types/query/query_types'
import { OrmaSchema } from '../types/schema_types'

const ajv = new Ajv()

describe('query_validation', () => {
    test('dev', () => {
        // const validate = ajv.compile(test_schema)
        // const data = {
        //     variants: {
        //     }
        // }
        // const valid = validate(data)
    })
    // tests:
    // inferred table name
    // random table name
    // 3 cases of fields
    // inferred fields must match from clause
    // can have an object with no inferred keys (so only keys that dont match any field name)
})
