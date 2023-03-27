import { OrmaSchema } from '../types/schema/schema_types'
import {
    replace_guids_with_values,
    save_resolved_guid_values,
} from './database_results/guid_processing'
import { sort_database_rows } from './database_results/sort_database_rows'
import { apply_guid_inference_macro } from './macros/guid_inference_macro'
import { apply_guid_plan_macro } from './macros/guid_plan_macro'
import { apply_infer_identifying_fields_macro } from './macros/identifying_fields_macro'
import { apply_inherit_operations_macro } from './macros/inherit_operations_macro'
import { apply_nesting_mutation_macro } from './macros/nesting_mutation_macro'
import { apply_upsert_macro } from './macros/upsert_macro'
import {
    get_mutation_batches,
    MutationPiece,
    MutationPlan,
    run_mutation_plan,
} from './plan/mutation_batches'
import {
    get_mutation_statements,
    OrmaStatement,
} from './statement_generation/mutation_statements'

export type MutationOperation = 'create' | 'update' | 'delete'
export type operation = MutationOperation | 'query'
export type MysqlFunction = (
    statements: OrmaStatement[]
) => Promise<Record<string, any>[][]>

export type ValuesByGuid = Record<string | number, any>

export const orma_mutate_prepare = (
    orma_schema: OrmaSchema,
    mutation
): MutationPlan => {
    const mutation_pieces = apply_nesting_mutation_macro(mutation)
    apply_inherit_operations_macro(mutation_pieces, mutation.$operation)
    apply_guid_inference_macro(orma_schema, mutation_pieces)
    const mutation_batch_object = get_mutation_batches(
        orma_schema,
        mutation_pieces as MutationPiece[]
    )
    const guid_map = apply_guid_plan_macro(
        mutation_batch_object.mutation_pieces,
        mutation_batch_object.mutation_batches
    )
    apply_infer_identifying_fields_macro(
        orma_schema,
        mutation_batch_object.mutation_pieces
    )

    return { ...mutation_batch_object, guid_map }
}

export const orma_mutate_run = async (
    orma_schema: OrmaSchema,
    mysql_function: MysqlFunction,
    mutation_plan: ReturnType<typeof orma_mutate_prepare>
) => {
    const { guid_map, mutation_pieces } = mutation_plan

    await apply_upsert_macro(
        orma_schema,
        mysql_function,
        guid_map,
        mutation_pieces
    )

    await run_mutation_plan(mutation_plan, async ({ mutation_batch }) => {
        const { mutation_infos, query_infos } = get_mutation_statements(
            mutation_pieces,
            mutation_batch,
            guid_map,
            orma_schema
        )

        if (mutation_infos.length > 0) {
            await mysql_function(mutation_infos)
        }

        if (query_infos.length > 0) {
            const query_results = await mysql_function(query_infos)
            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                guid_map,
                mutation_batch,
                query_infos.map(el => el.ast.$from as string),
                query_results,
                orma_schema
            )
            save_resolved_guid_values(
                mutation_pieces,
                mutation_batch,
                sorted_database_rows
            )
        }
    })

    replace_guids_with_values(mutation_pieces, guid_map)
}

export const orma_mutate = async (
    input_mutation,
    mysql_function: MysqlFunction,
    orma_schema: OrmaSchema
) => {
    const mutation_plan = orma_mutate_prepare(orma_schema, input_mutation)
    const results = await orma_mutate_run(
        orma_schema,
        mysql_function,
        mutation_plan
    )
    return results
}
