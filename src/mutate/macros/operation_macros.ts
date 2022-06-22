import { orma_escape } from '../../helpers/escape'
import { push_path } from '../../helpers/push_path'
import { is_reserved_keyword } from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { combine_wheres } from '../../query/query_helpers'
import {
    generate_record_where_clause,
    MutationOperation,
    path_to_entity,
} from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'

export const get_mutation_statements = (
    mutation_pieces: MutationPiece[],
    values_by_guid: Record<any, any>,
    orma_schema: OrmaSchema
) => {
    const grouped_mutation = group_mutation_pieces(mutation_pieces)
    const mutation_statements = Object.keys(grouped_mutation).flatMap(
        (operation: MutationOperation) => {
            return Object.keys(grouped_mutation[operation]).flatMap(entity => {
                const group_pieces = grouped_mutation[operation][entity]
                let asts: Record<any, any>[]
                if (operation === 'create') {
                    asts = [
                        get_create_ast(group_pieces, entity, values_by_guid),
                    ]
                } else if (operation === 'update') {
                    asts = group_pieces.map(mutation_piece =>
                        get_update_ast(
                            mutation_piece,
                            values_by_guid,
                            orma_schema
                        )
                    )
                } else if (operation === 'delete') {
                    asts = [get_delete_ast(group_pieces, entity, orma_schema)]
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
                    }))
            })
        }
    )

    return mutation_statements
}

type GroupedMutation = {
    [operation in MutationOperation]?: {
        [entity in string]?: MutationPiece[]
    }
}

const group_mutation_pieces = (mutation_pieces: MutationPiece[]) => {
    const grouped_mutation = mutation_pieces.reduce((acc, mutation_piece) => {
        const operation = mutation_piece.record.$operation
        const entity = path_to_entity(mutation_piece.path)
        push_path([operation, entity], mutation_piece, acc)
        return acc
    }, {} as GroupedMutation)

    return grouped_mutation
}

const get_create_ast = (
    mutation_pieces: MutationPiece[],
    entity: string,
    values_by_guid: Record<any, any>
) => {
    // get insert keys by combining the keys from all records
    const fields = mutation_pieces.reduce((acc, mutation_piece, i) => {
        Object.keys(mutation_piece.record).forEach(field => {
            // filter lower tables and keywords such as $operation from the sql
            const resolved_value = get_resolved_mutation_value(
                mutation_piece.record,
                field,
                values_by_guid
            )
            if (resolved_value !== undefined) {
                acc.add(field)
            }
        })

        return acc
    }, new Set() as Set<string>)

    const values = mutation_pieces
        .map((mutation_piece, i) => {
            const record_values = [...fields].flatMap(field => {
                const resolved_value = get_resolved_mutation_value(
                    mutation_piece.record,
                    field,
                    values_by_guid
                )
                const escaped_value = orma_escape(resolved_value ?? null)
                return escaped_value
            })

            return record_values
        })

    const ast = {
        $insert_into: [entity, [...fields]],
        $values: values,
    }

    return ast
}

export const get_resolved_mutation_value = (
    record: Record<string, any>,
    field: string,
    values_by_guid: Record<any, any>
) => {
    const value = record[field]

    // dont process submutations or keywords such as $operation
    if (Array.isArray(value) || is_reserved_keyword(field)) {
        return undefined
    }

    const resolved_value =
        value?.$guid === undefined ? value : values_by_guid[value.$guid]

    return resolved_value
}

const get_update_ast = (
    mutation_piece: MutationPiece,
    values_by_guid: Record<any, any>,
    orma_schema: OrmaSchema
) => {
    const { identifying_keys, where } = generate_record_where_clause(
        mutation_piece,
        orma_schema,
        false
    )

    const $set = Object.keys(mutation_piece.record)
        .map(field => {
            if (identifying_keys.includes(field)) {
                return undefined
            }

            const resolved_value = get_resolved_mutation_value(
                mutation_piece.record,
                field,
                values_by_guid
            )
            if (resolved_value === undefined) {
                return undefined
            }
            const escaped_value = orma_escape(resolved_value)

            return [field, escaped_value]
        })
        .filter(el => el !== undefined)

    const entity = path_to_entity(mutation_piece.path)

    return $set.length === 0
        ? undefined
        : {
              $update: entity,
              $set,
              $where: where,
          }
}

const get_delete_ast = (
    mutation_pieces: MutationPiece[],
    entity: string,
    orma_schema: OrmaSchema
) => {
    const wheres = mutation_pieces.map(mutation_piece => {
        const { where } = generate_record_where_clause(
            mutation_piece,
            orma_schema,
            false
        )

        return where
    })

    const $where = combine_wheres(wheres, '$or')

    const ast = {
        $delete_from: entity,
        $where,
    }

    return ast
}
