import { OrmaSchema } from '../../introspector/introspector'
import { apply_escape_macro_to_query_part } from '../../query/macros/escaping_macros'
import { combine_wheres } from '../../query/query_helpers'
import { generate_record_where_clause } from '../helpers/record_searching'
import { ValuesByGuid } from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'

/**
 * Generates a query which, when run, will return all the data needed to
 *  1. match database record with mutation record (the identifying keys)
 *  2. replace guids with their resolved value (any field with a $guid)
 * Data is returned for all creates and updated in the input mutation pieces
 */
export const get_guid_query = (
    input_mutation_pieces: MutationPiece[],
    entity: string,
    values_by_guid: ValuesByGuid,
    orma_schema: OrmaSchema
) => {
    // $guids are not saved for deletes
    const mutation_pieces = input_mutation_pieces.filter(
        ({ record }) =>
            record.$operation === 'create' || record.$operation === 'update'
    )

    if (mutation_pieces.length === 0) {
        return undefined // can happen if the mutation is all deletes
    }

    // get a list of fields with guids that we should query
    const guid_fields = mutation_pieces.reduce<Set<string>>(
        (acc, { record }) => {
            Object.keys(record).forEach(key => {
                if (record[key]?.$guid !== undefined) {
                    acc.add(key)
                }
            })
            return acc
        },
        new Set()
    )

    // get identifying keys which are needed for matching records later
    let all_identifying_keys = new Set<string>()
    const wheres = mutation_pieces.map((mutation_piece, i) => {
        const { where, identifying_keys } = generate_record_where_clause(
            mutation_piece,
            values_by_guid,
            orma_schema,
            true // we dont mind if the unique key is ambiguous, since the choice of key doesnt do anything
            // (unlike in an update, where it determines which fields are modified). We just select any key in
            // a repeatable way so we can do row matching later
        )
        identifying_keys.forEach(key => all_identifying_keys.add(key))

        // must apply escape macro since we need valid SQL AST
        apply_escape_macro_to_query_part(orma_schema, entity, where)

        return where
    })

    const $where = combine_wheres(wheres, '$or')

    // guid fields are needed for foreign key propagation while identifying keys are just needed to match up
    // database rows with mutation rows later on
    const fields = [...guid_fields, ...all_identifying_keys]
    if (guid_fields.size === 0) {
        return undefined // can happen if there are no guids in the mutation
    }

    const query = {
        $select: fields,
        $from: entity,
        $where,
    }

    return query
}
