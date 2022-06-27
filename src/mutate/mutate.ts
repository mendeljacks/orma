import { clone } from '../helpers/helpers'
import { OrmaSchema } from '../introspector/introspector'
import {
    replace_guids_with_values,
    save_guids,
} from './database_results/guid_processing'
import { sort_database_rows } from './database_results/sort_database_rows'
import { apply_guid_inference_macro } from './macros/guid_inference_macro'
import { apply_inherit_operations_macro } from './macros/inherit_operations_macro'
import { get_mutation_plan, run_mutation_plan } from './plan/mutation_plan'
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
export const orma_mutate = async (
    input_mutation,
    mysql_function: mysql_fn,
    orma_schema: OrmaSchema
) => {
    // clone to allow macros to mutate the mutation without changing the user input mutation object
    const mutation = clone(input_mutation)

    const values_by_guid: ValuesByGuid = {}

    apply_inherit_operations_macro(mutation)
    apply_guid_inference_macro(mutation, orma_schema)

    const mutation_plan = get_mutation_plan(mutation, orma_schema)

    run_mutation_plan(mutation_plan, async ({ mutation_pieces }) => {
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
                query_infos,
                query_results,
                orma_schema
            )
            save_guids(values_by_guid, mutation_pieces, sorted_database_rows)
        }
    })

    replace_guids_with_values(mutation, values_by_guid)
    return mutation
}
