import { orma_introspect as orma_introspect_import } from './introspector/introspector'
import { orma_query as orma_query_import } from './query/query'
import { orma_mutate as orma_mutate_import } from './mutate/mutate'

export const orma_introspect = orma_introspect_import
export const orma_query = orma_query_import

export { get_mutation_connected_errors } from './mutate/verifications/mutation_connected'
export {
    orma_mutate,
    orma_mutate_prepare,
    orma_mutate_run,
    mysql_fn as MysqlFunction,
} from './mutate/mutate'

export { OrmaStatement } from './mutate/statement_generation/mutation_statements'