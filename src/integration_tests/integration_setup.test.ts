import { copyFileSync, existsSync, unlinkSync } from 'fs'
import { before, beforeEach, describe, test } from 'mocha'
import * as sqlite3 from 'sqlite3'
import { sqlite3_adapter } from '../helpers/database_adapters'
import { validate_errors } from '../helpers/helpers'
import {
    GlobalTestMutation,
    GlobalTestSchema,
    global_test_schema,
} from '../test_data/global_test_schema'
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
import { global_test_hydration } from '../test_data/global_test_hydration'

type TestDatabase = {
    db: sqlite3.Database | undefined
    file_name: string
}
let test_database: TestDatabase = {
    db: undefined,
    file_name: 'test_database',
}

const checkpoint_name = 'test_database_checkpoint'

export const remove_file = (file_name: string) => {
    if (existsSync(file_name)) {
        unlinkSync(file_name)
    }
}

const clear_database_files = () => {
    remove_file(test_database.file_name)
    remove_file(checkpoint_name)
}

export const open_database = async (test_database: TestDatabase) =>
    new Promise<void>(
        (accept, reject) =>
            (test_database.db = new sqlite3.Database(
                test_database.file_name,
                e => (e ? reject() : accept())
            ))
    )

export const close_database = async (test_database: TestDatabase) =>
    new Promise<void>((resolve, reject) =>
        test_database.db?.close(err => (err ? reject(err) : resolve()))
    )

export const integration_test_setup = () => {
    before(async () => {
        clear_database_files()
        await open_database(test_database)

        const schema_diff = get_schema_diff(
            { $entities: {} },
            global_test_schema
        )
        const statements = schema_diff.map(ast => ({
            sql_string: json_to_sql(ast, 'sqlite'),
        }))
        await sqlite3_adapter(test_database.db!)(statements)
        await test_mutate(global_test_hydration)
        copyFileSync(test_database.file_name, checkpoint_name)
    })

    beforeEach(async () => {
        await close_database(test_database)
        copyFileSync(checkpoint_name, test_database.file_name)
        await open_database(test_database)
    })

    after(async () => {
        await close_database(test_database)
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
    validate_errors([validate_mutation(mutation, global_test_schema)])
    const mutation_plan = orma_mutate_prepare(global_test_schema, mutation)
    validate_errors([
        await get_mutation_connected_errors(
            global_test_schema,
            connection_edges,
            sqlite3_adapter(test_database.db!),
            mutation_plan.guid_map,
            where_connecteds,
            mutation_plan.mutation_pieces
        ),
    ])

    const res = await orma_mutate_run(
        global_test_schema,
        sqlite3_adapter(test_database.db!),
        mutation_plan
    )
    return res
}

export const test_query = async <T extends Record<string, any>>(query: T) => {
    validate_errors([validate_query(query, global_test_schema)])
    const res = await orma_query(
        query,
        global_test_schema,
        sqlite3_adapter(test_database.db!),
        connection_edges
    )
    return res
}
