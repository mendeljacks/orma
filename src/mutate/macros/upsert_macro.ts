import { last } from '../../helpers/helpers'
import { get_real_entity_name, orma_query } from '../../query/query'
import { combine_wheres } from '../../query/query_helpers'
import { Path } from '../../types'
import { OrmaSchema } from '../../types/schema/schema_types'
import { path_to_entity } from '../helpers/mutate_helpers'
import { generate_record_where_clause_from_identifying_keys } from '../helpers/record_searching'
import { MutationOperation, MysqlFunction } from '../mutate'

export const apply_upsert_macro = async (
    orma_schema: OrmaSchema,
    mysql_function: MysqlFunction,
    mutation_pieces: MutationPiece[]
) => {
    const query = get_upsert_macro_query(mutation_pieces)
    const results = await orma_query(query, orma_schema, mysql_function)
}

export const get_upsert_macro_query = (mutation_pieces: MutationPiece[]) => {
    const query = mutation_pieces.reduce((acc, mutation_pieces) => {
        const { record, path } = mutation_pieces

        if (record.$operation !== 'upsert') {
            return acc
        }

        const entity = path_to_entity(path)

        if (!acc[entity]) {
            acc[entity] = {}
        }

        record.$identifying_keys?.forEach(key => (acc[entity][key] = true))
        const where = generate_record_where_clause_from_identifying_keys(
            {},
            record.$identifying_keys,
            record
        )
        record[entity].$where = combine_wheres(
            [record[entity].$where, where],
            '$or'
        )

        return acc
    }, {} as Record<string, any>)

    return query
}

type MutationPiece = {
    record: Record<string, any> &
        (
            | {
                  $operation: 'upsert'
                  $identifying_keys: string[]
              }
            | {
                  $operation: MutationOperation
              }
        )
    path: Path
}
