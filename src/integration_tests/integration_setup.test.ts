import { copyFileSync, existsSync, unlinkSync } from 'fs'
import { before, beforeEach, describe, test } from 'mocha'
import * as sqlite3 from 'sqlite3'
import { sqlite3_adapter } from '../helpers/database_adapters'
import { validate_errors } from '../helpers/helpers'
import {
    GlobalTestMutation,
    GlobalTestSchema,
    global_test_hydration,
    global_test_schema,
} from '../helpers/tests/global_test_schema'
import { orma_mutate_prepare, orma_mutate_run } from '../mutate/mutate'
import { validate_mutation } from '../mutate/verifications/mutate_validation'
import { get_mutation_connected_errors } from '../mutate/verifications/mutation_connected'
import { json_to_sql } from '../query/json_sql'
import {
    add_connection_edges,
    get_upwards_connection_edges,
} from '../query/macros/where_connected_macro'
import { orma_query } from '../query/query'
import { validate_query } from '../query/validation/query_validation'
import { get_schema_diff } from '../schema/schema_macro'
import { WhereConnected } from '../types/query/query_types'

let db: sqlite3.Database

const data_name = 'test_database'
const checkpoint_name = 'test_database_checkpoint'

const clear_database_files = () => {
    if (existsSync(data_name)) {
        unlinkSync(data_name)
    }

    if (existsSync(checkpoint_name)) {
        unlinkSync(checkpoint_name)
    }
}

const open_database = async () =>
    new Promise<void>(
        (accept, reject) =>
            (db = new sqlite3.Database(data_name, e =>
                e ? reject() : accept()
            ))
    )

const close_db = async () =>
    new Promise<void>((resolve, reject) =>
        db.close(err => (err ? reject(err) : resolve()))
    )

export const integration_test_setup = () => {
    before(async () => {
        clear_database_files()
        await open_database()

        const schema_diff = get_schema_diff(
            { $entities: {} },
            global_test_schema
        )
        const statements = schema_diff.map(ast => ({
            sql_string: json_to_sql(ast, 'sqlite'),
        }))
        await sqlite3_adapter(db)(statements)
        await test_mutate(global_test_hydration)
        copyFileSync(data_name, checkpoint_name)
    })

    beforeEach(async () => {
        await close_db()
        copyFileSync(checkpoint_name, data_name)
        await open_database()
    })

    after(async () => {
        await close_db()
        clear_database_files()
    })
}

const connection_edges = add_connection_edges(
    get_upwards_connection_edges(global_test_schema),
    [
        {
            from_entity: 'addresses',
            from_field: 'id',
            to_entity: 'users',
            to_field: 'billing_address_id',
        },
        {
            from_entity: 'addresses',
            from_field: 'id',
            to_entity: 'users',
            to_field: 'shipping_address_id',
        },
    ]
)

export const test_mutate = async (
    mutation: GlobalTestMutation,
    where_connecteds: WhereConnected<GlobalTestSchema> = []
) => {
    const mutation_plan = orma_mutate_prepare(global_test_schema, mutation)
    validate_errors([
        validate_mutation(mutation, global_test_schema),
        await get_mutation_connected_errors(
            global_test_schema,
            connection_edges,
            sqlite3_adapter(db),
            where_connecteds,
            mutation_plan.mutation_pieces
        ),
    ])

    const res = await orma_mutate_run(
        global_test_schema,
        sqlite3_adapter(db),
        mutation_plan,
        mutation
    )
    return res
}

export const test_query = async (query: Record<string, any>) => {
    validate_errors([validate_query(query, global_test_schema)])
    const res = await orma_query(
        query,
        global_test_schema,
        sqlite3_adapter(db),
        connection_edges
    )
    return res
}