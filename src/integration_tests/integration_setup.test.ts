import { before, beforeEach } from 'mocha'
import * as sqlite3 from 'sqlite3'
import { sqlite3_adapter } from '../helpers/database_adapters'
import { validate_errors } from '../helpers/helpers'
import { orma_mutate_prepare, orma_mutate_run } from '../mutate/mutate'
import { validate_mutation } from '../mutate/verifications/mutate_validation'
import { get_mutation_connected_errors } from '../mutate/verifications/mutation_connected'
import { get_unique_verification_errors } from '../mutate/verifications/verify_uniqueness'
import {
    add_connection_edges,
    get_upwards_connection_edges,
} from '../query/macros/where_connected_macro'
import { orma_query } from '../query/query'
import { validate_query } from '../query/validation/query_validation'
import { global_test_hydration } from '../test_data/global_test_hydration'
import {
    GlobalTestAliases,
    GlobalTestMutation,
    GlobalTestSchema,
    global_test_schema,
} from '../test_data/global_test_schema'
import { OrmaQueryResult } from '../types/query/query_result_types'
import { WhereConnected } from '../types/query/query_types'
import {
    reset_test_database,
    set_up_test_database,
    tear_down_test_database,
} from './integration_test_helpers'

let test_database = {
    db: undefined as sqlite3.Database | undefined,
}

const test_database_directory = './'

before(async () => {
    test_database.db = await set_up_test_database(
        global_test_schema,
        global_test_hydration,
        test_database_directory
    )
})

after(async () =>
    tear_down_test_database(test_database.db, test_database_directory)
)

export const register_integration_test = () => {
    beforeEach(
        async () =>
            (test_database.db = await reset_test_database(
                test_database.db,
                test_database_directory
            ))
    )
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
        await get_unique_verification_errors(
            global_test_schema,
            sqlite3_adapter(test_database.db!),
            mutation_plan
        ),
    ])

    const res = await orma_mutate_run(
        global_test_schema,
        sqlite3_adapter(test_database.db!),
        mutation_plan
    )
    return res
}

export const test_query = async <T extends Record<string, any>>(
    query: T
): Promise<OrmaQueryResult<GlobalTestSchema, T>> => {
    validate_errors([validate_query(query, global_test_schema)])
    const res = await (orma_query as any)(
        query,
        global_test_schema,
        sqlite3_adapter(test_database.db!),
        connection_edges
    )
    return res
}
