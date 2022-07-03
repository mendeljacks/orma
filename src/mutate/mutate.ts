import { clone } from '../helpers/helpers'
import { OrmaSchema } from '../introspector/introspector'
import {
    replace_guids_with_values,
    save_guids,
} from './database_results/guid_processing'
import { sort_database_rows } from './database_results/sort_database_rows'
import { apply_guid_inference_macro } from './macros/guid_inference_macro'
import { apply_inherit_operations_macro } from './macros/inherit_operations_macro'
import {
    get_mutation_plan,
    MutationPlan,
    run_mutation_plan,
} from './plan/mutation_plan'
import { get_mutation_statements } from './statement_generation/mutation_statements'

export type MutationOperation = 'create' | 'update' | 'delete'
export type operation = MutationOperation | 'query'
export type mysql_fn = (statements) => Promise<Record<string, any>[][]>
export type statements = {
    sql_ast: Record<any, any>
    sql_string: string
    route: string[]
    operation: operation
    paths: (string | number)[][]
}[]

export type ValuesByGuid = Record<string | number, any>
type MiddlewareHookArgs = { mutation_plan: MutationPlan; mutation }

export const orma_mutate_prepare = (
    orma_schema: OrmaSchema,
    input_mutation,
) => {
    // clone to allow macros to mutate the mutation without changing the user input mutation object
    let mutation = clone(input_mutation)

    apply_inherit_operations_macro(mutation)
    apply_guid_inference_macro(mutation, orma_schema)

    const mutation_plan = get_mutation_plan(mutation, orma_schema)
    return mutation_plan
}

export const orma_mutate_run = async (
    orma_schema: OrmaSchema,
    mysql_function: mysql_fn,
    mutation_plan: MutationPlan,
    input_mutation: any,
) => {
    const values_by_guid: ValuesByGuid = {}

    await run_mutation_plan(mutation_plan, async ({ mutation_pieces }) => {
        const { mutation_infos, query_infos } = get_mutation_statements(
            mutation_pieces,
            values_by_guid,
            orma_schema
        )

        if (mutation_infos.length > 0) {
            await mysql_function(mutation_infos)
        }

        if (query_infos.length > 0) {
            const query_results = await mysql_function(query_infos)
            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                query_infos.map(el => el.ast),
                query_results,
                values_by_guid,
                orma_schema
            )
            save_guids(values_by_guid, mutation_pieces, sorted_database_rows)
        }
    })

    const mutation = clone(input_mutation)
    replace_guids_with_values(mutation, values_by_guid)
    return mutation
}

export const orma_mutate = async (
    input_mutation,
    mysql_function: mysql_fn,
    orma_schema: OrmaSchema
) => {
    const mutation_plan = orma_mutate_prepare(orma_schema, input_mutation)
    const results = await orma_mutate_run(orma_schema, mysql_function, mutation_plan, input_mutation)
    return results
}
