// query
export { orma_query } from './query/query'
export { validate_query } from './query/validation/query_validation'
export {
    get_upwards_connection_edges,
    restrict_where_connected,
    type ConnectionEdges,
    add_connection_edges,
    remove_connection_edges,
} from './query/macros/where_connected_macro'
export { type Edge, reverse_edge } from './helpers/schema_helpers'
export { combine_wheres } from './query/query_helpers'
export { type OrmaQuery } from './types/query/query_types'
export {
    type OrmaQueryResult,
    type OrmaRecord,
    type OrmaColumn
} from './types/query/query_result_types'

// mutate
export {
    orma_mutate,
    orma_mutate_prepare,
    orma_mutate_run,
    type MysqlFunction,
} from './mutate/mutate'
export { type OrmaStatement } from './mutate/statement_generation/mutation_statements'
export { get_mutation_connected_errors } from './mutate/verifications/mutation_connected'
export { get_unique_verification_errors } from './mutate/verifications/verify_uniqueness'
export { get_delete_verification_errors } from './mutate/verifications/verify_deletes'
export {
    get_mutation_diff,
    get_mutation_diff as diff_mutation,
} from './mutate/diff/diff_mutation'
export { apply_guid_inference_macro } from './mutate/macros/guid_inference_macro'
export { apply_inherit_operations_macro } from './mutate/macros/inherit_operations_macro'
export { path_to_table as mutation_path_to_table } from './mutate/helpers/mutate_helpers'

// introspect
export {
    orma_introspect,
    generate_orma_schema_cache,
} from './schema/introspector'
export { type OrmaSchema } from './schema/schema_types'

// adapters
export { mysql2_adapter } from './helpers/database_adapters'
