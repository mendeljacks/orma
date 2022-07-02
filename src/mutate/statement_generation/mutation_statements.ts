import { push_path } from '../../helpers/push_path'
import { OrmaSchema } from '../../introspector/introspector'
import { json_to_sql } from '../../query/json_sql'
import { Path } from '../../types'
import { path_to_entity } from '../helpers/mutate_helpers'
import { MutationOperation, operation, ValuesByGuid } from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'
import { get_guid_query } from './mutation_guid_query'
import {
    get_create_ast,
    get_delete_ast,
    get_update_ast,
} from './mutation_operations'

export type MutationStatement = {
    ast: Record<string, any>
    operation: operation
    entity: string
    records: Record<string, any>[]
    paths: Path[]
    sql_string: string
}

/**
 * Groups the input mutation pieces by entity and operation, generates asts for them, then generates sql strings
 * from the asts
 */
export const get_mutation_statements = (
    input_mutation_pieces: MutationPiece[],
    values_by_guid: Record<any, any>,
    orma_schema: OrmaSchema
): {
    mutation_infos: MutationStatement[]
    query_infos: MutationStatement[]
} => {
    const grouped_mutation = get_grouped_mutation(input_mutation_pieces)

    const mutation_infos = Object.keys(grouped_mutation).flatMap(entity =>
        Object.keys(grouped_mutation[entity]).flatMap(
            (operation: MutationOperation) => {
                const group_pieces = grouped_mutation[entity][operation]
                return get_mutation_infos_for_group(
                    group_pieces,
                    operation,
                    entity,
                    values_by_guid,
                    orma_schema
                )
            }
        )
    )

    const query_infos: MutationStatement[] = Object.keys(
        grouped_mutation
    ).flatMap(entity => {
        const create_pieces = grouped_mutation[entity].create ?? []
        const update_pieces = grouped_mutation[entity].update ?? []
        const group_pieces = [...create_pieces, ...update_pieces]
        const guid_query = get_guid_query(group_pieces, entity, values_by_guid, orma_schema)
        return guid_query
            ? [
                  {
                      ast: guid_query,
                      operation: 'query',
                      entity,
                      records: group_pieces.map(el => el.record),
                      paths: group_pieces.map(el => el.path),
                      sql_string: json_to_sql(guid_query),
                  },
              ]
            : []
    })

    return { mutation_infos, query_infos }
}

const get_grouped_mutation = (mutation_pieces: MutationPiece[]) => {
    const grouped_mutation = mutation_pieces.reduce((acc, mutation_piece) => {
        const operation = mutation_piece.record.$operation
        const entity = path_to_entity(mutation_piece.path)
        push_path([entity, operation], mutation_piece, acc)
        return acc
    }, {} as GroupedMutation)

    return grouped_mutation
}

const get_mutation_infos_for_group = (
    mutation_pieces: MutationPiece[],
    operation: MutationOperation,
    entity: string,
    values_by_guid: ValuesByGuid,
    orma_schema: OrmaSchema
) => {
    let asts: Record<any, any>[]
    if (operation === 'create') {
        asts = [get_create_ast(mutation_pieces, entity, values_by_guid)]
    } else if (operation === 'update') {
        asts = mutation_pieces.map(mutation_piece =>
            get_update_ast(mutation_piece, values_by_guid, orma_schema)
        )
    } else if (operation === 'delete') {
        asts = [get_delete_ast(mutation_pieces, entity, values_by_guid, orma_schema)]
    } else {
        throw new Error(`Unrecognized $operation ${operation}`)
    }

    return asts
        .filter(ast => ast !== undefined) // can be undefined if there is nothing to do, e.g. a stub update
        .map(ast => ({
            ast,
            operation,
            entity,
            records: mutation_pieces.map(el => el.record),
            paths: mutation_pieces.map(el => el.path),
            sql_string: json_to_sql(ast),
        }))
}

type GroupedMutation = {
    [Entity in string]?: {
        [Operation in MutationOperation]?: MutationPiece[]
    }
}
