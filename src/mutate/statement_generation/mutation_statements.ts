import { push_path } from '../../helpers/push_path'
import { OrmaSchema } from '../../types/schema/schema_types'
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
import { GuidMap } from '../macros/guid_plan_macro'

export type OrmaStatement = {
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
    guid_map: GuidMap,
    orma_schema: OrmaSchema
): {
    mutation_infos: OrmaStatement[]
    query_infos: OrmaStatement[]
} => {
    const grouped_mutation = get_grouped_mutation(input_mutation_pieces)

    const mutation_infos = Object.keys(grouped_mutation).flatMap(entity =>
        Object.keys(grouped_mutation[entity] ?? {}).flatMap(
            (operation: MutationOperation) => {
                const group_indices =
                    grouped_mutation?.[entity]?.[operation] ?? []
                return get_mutation_infos_for_group(
                    input_mutation_pieces,
                    group_indices,
                    operation,
                    entity,
                    guid_map,
                    orma_schema
                )
            }
        )
    )

    const query_infos: OrmaStatement[] = Object.keys(grouped_mutation).flatMap(
        entity => {
            const create_indices = grouped_mutation?.[entity]?.create ?? []
            const update_indices = grouped_mutation?.[entity]?.update ?? []
            const group_indices = [...create_indices, ...update_indices]
            const guid_query = get_guid_query(
                group_indices,
                entity,
                guid_map,
                orma_schema
            )
            return guid_query
                ? [generate_statement(guid_query, group_indices)]
                : []
        }
    )

    return { mutation_infos, query_infos }
}

const get_grouped_mutation = (mutation_pieces: MutationPiece[]) => {
    const grouped_mutation = mutation_pieces.reduce((acc, mutation_piece, piece_index) => {
        const operation = mutation_piece.record.$operation
        const entity = path_to_entity(mutation_piece.path)
        push_path([entity, operation], piece_index, acc)
        return acc
    }, {} as GroupedMutation)

    return grouped_mutation
}

const get_mutation_infos_for_group = (
    mutation_pieces: MutationPiece[],
    group_indices: number[],
    operation: MutationOperation,
    entity: string,
    guid_map: GuidMap,
    orma_schema: OrmaSchema
) => {
    let asts: (Record<any, any> | undefined)[]
    if (operation === 'create') {
        asts = [get_create_ast(mutation_pieces, entity, orma_schema)]
    } else if (operation === 'update') {
        asts = mutation_pieces.map((mutation_piece, piece_index) =>
            get_update_ast(mutation_pieces, piece_index, guid_map, orma_schema)
        )
    } else if (operation === 'delete') {
        asts = [get_delete_ast(orma_schema, mutation_pieces, entity, guid_map)]
    } else {
        throw new Error(`Unrecognized $operation ${operation}`)
    }

    return asts.flatMap(ast =>
        // can be undefined if there is nothing to do, e.g. a stub update
        ast === undefined ? [] : [generate_statement(ast, mutation_pieces)]
    )
}

type GroupedMutation = {
    [Entity in string]?: {
        [Operation in MutationOperation]?: number[] // mutation piece indexes
    }
}

export const generate_statement = (
    ast: Record<string, any>,
    mutation_pieces: MutationPiece[]
) => {
    const statement: OrmaStatement = {
        ast,
        entity: path_to_entity(mutation_pieces?.[0]?.path ?? []),
        operation:
            ast.$from === undefined
                ? mutation_pieces?.[0]?.record?.$operation
                : 'query',
        paths: mutation_pieces?.map(el => el.path) ?? [],
        records: mutation_pieces?.map(el => el.record) ?? [],
        sql_string: json_to_sql(ast),
    }

    return statement
}
