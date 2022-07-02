import { orma_escape } from '../../helpers/escape'
import { OrmaSchema } from '../../introspector/introspector'
import { ValuesByGuid } from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'
import {
    get_resolved_mutation_value,
    throw_identifying_key_errors,
} from '../statement_generation/mutation_operations'
import { get_identifying_keys } from './identifying_keys'
import { path_to_entity } from './mutate_helpers'

export const generate_record_where_clause = (
    mutation_piece: MutationPiece,
    values_by_guid: ValuesByGuid,
    orma_schema: OrmaSchema,
    allow_ambiguous_unique_keys: boolean = false
) => {
    const { record, path } = mutation_piece
    const entity_name = path_to_entity(path)

    const identifying_keys = get_identifying_keys(
        entity_name,
        record,
        values_by_guid,
        orma_schema,
        allow_ambiguous_unique_keys
    )

    // throw if we cant find a unique key
    throw_identifying_key_errors(record.$operation, identifying_keys, path)

    const where_clauses = identifying_keys.map(key => ({
        $eq: [
            key,
            orma_escape(
                get_resolved_mutation_value(record, key, values_by_guid)
            ),
        ],
    }))

    const where =
        where_clauses.length > 1
            ? {
                  $and: where_clauses,
              }
            : where_clauses?.[0]

    return { where, identifying_keys }
}
