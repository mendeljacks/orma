import { OrmaSchema } from '../../types/schema/schema_types'
import { combine_wheres } from '../../query/query_helpers'
import { ValuesByGuid } from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'
import {
    get_resolved_mutation_value,
    throw_identifying_key_errors,
} from '../statement_generation/mutation_operations'
import { path_to_entity } from './mutate_helpers'
import { get_identifying_fields } from '../macros/identifying_fields_macro'

// export const generate_record_where_clause = (
//     mutation_piece: MutationPiece,
//     values_by_guid: ValuesByGuid,
//     orma_schema: OrmaSchema,
//     allow_ambiguous_unique_keys: boolean = false,
//     throw_on_no_identifying_keys: boolean = true
// ) => {
//     const { record, path } = mutation_piece
//     const entity_name = path_to_entity(path)

//     const identifying_keys = get_identifying_fields(
//         entity_name,
//         record,
//         values_by_guid,
//         orma_schema,
//         allow_ambiguous_unique_keys
//     )

//     if (throw_on_no_identifying_keys) {
//         // throw if we cant find a unique key
//         throw_identifying_key_errors(record.$operation, identifying_keys, path)
//     } else if (!identifying_keys?.length) {
//         return { identifying_keys }
//     }

//     const where = generate_record_where_clause_from_identifying_keys(
//         values_by_guid,
//         identifying_keys,
//         mutation_piece.record
//     )

//     return { where, identifying_keys }
// }

export const generate_identifying_where = (
    values_by_guid: ValuesByGuid,
    identifying_keys: string[],
    record: Record<string, any>
) => {
    const where_clauses = identifying_keys.map(key => ({
        $eq: [
            key,
            {
                $escape: get_resolved_mutation_value(
                    record,
                    key,
                    values_by_guid
                ),
            },
        ],
    }))

    // this will not be undefined if identifying_keys is not empty, which is assumed true
    const where = combine_wheres(where_clauses, '$and') ?? {}

    return where
}
