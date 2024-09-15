import { OrmaError } from '../../helpers/error_handling'
import { orma_escape } from '../../helpers/escape'
import {
    get_column_schema,
    is_reserved_keyword
} from '../../helpers/schema_helpers'
import { json_to_sql } from '../../query/ast_to_sql'
import { apply_escape_macro_to_query_part } from '../../query/macros/escaping_macros'
import { OrmaSchema } from '../../schema/schema_types'
import { is_submutation, path_to_table } from '../helpers/mutate_helpers'
import { get_identifying_where } from '../helpers/record_searching'
import { GuidMap } from '../macros/guid_plan_macro'
import { MutationPiece } from '../plan/mutation_batches'

export const get_create_ast = (
    mutation_pieces: MutationPiece[],
    guid_map: GuidMap,
    piece_indices: number[],
    table: string,
    orma_schema: OrmaSchema
) => {
    // get insert keys by combining the keys from all records
    const columns = piece_indices.reduce((acc, piece_index) => {
        const mutation_piece = mutation_pieces[piece_index]
        Object.keys(mutation_piece.record).forEach(column => {
            // filter lower tables and keywords such as $operation from the sql
            const resolved_value = get_resolved_mutation_value_if_column(
                mutation_pieces,
                guid_map,
                mutation_piece.record,
                column
            )
            if (resolved_value !== undefined) {
                acc.add(column)
            }
        })

        return acc
    }, new Set() as Set<string>)

    const values = piece_indices.map(piece_index => {
        const mutation_piece = mutation_pieces[piece_index]
        const record_values = [...columns].flatMap(column => {
            const resolved_value = get_resolved_mutation_value_if_column(
                mutation_pieces,
                guid_map,
                mutation_piece.record,
                column
            )

            const el = get_column_schema(orma_schema, table, column)?.$default
            const value_or_default =
                resolved_value === undefined
                    ? // run it through the ast parser to handle function defaults like $current_timestamp
                      json_to_sql(
                          get_column_schema(orma_schema, table, column).$default
                      )
                    : resolved_value

            const escaped_value = orma_escape(
                value_or_default ?? null,
                orma_schema.tables[table].database_type
            )
            return escaped_value
        })

        return record_values
    })

    const ast = {
        $insert_into: [table, [...columns]],
        $values: values
    }

    return ast
}

const get_resolved_mutation_value_if_column = (
    mutation_pieces: MutationPiece[],
    guid_map: GuidMap,
    record: Record<string, any>,
    column: string
) => {
    // dont process submutations, keywords such as $operation, or $write guids since
    // the resolved value is not yet in scope
    if (
        is_submutation(record, column) ||
        is_reserved_keyword(column) ||
        record[column]?.$write
    ) {
        return undefined
    }

    const resolved_value = get_resolved_mutation_value(
        mutation_pieces,
        guid_map,
        record,
        column
    )
    return resolved_value?.$guid === undefined ? resolved_value : undefined
}

export const get_resolved_mutation_value = (
    mutation_pieces: MutationPiece[],
    guid_map: GuidMap,
    record: Record<string, any>,
    column: string
) => {
    const value = record[column]

    const has_guid = value?.$guid !== undefined
    if (has_guid && value?.$read) {
        const { piece_index, column } = guid_map.get(value.$guid)!.write
        const resolved_value =
            mutation_pieces[piece_index].record[column].$resolved_value

        return resolved_value
    } else {
        return value
    }
}

export const get_update_ast = (
    mutation_pieces: MutationPiece[],
    mutation_piece_index: number,
    guid_map: GuidMap,
    orma_schema: OrmaSchema
) => {
    const mutation_piece = mutation_pieces[mutation_piece_index]
    const table = path_to_table(mutation_piece.path)

    const identifying_columns = mutation_piece.record
        .$identifying_columns as string[]

    if (!identifying_columns?.length) {
        // to handle updates with no props
        return undefined
    }

    const where = get_identifying_where(
        orma_schema,
        guid_map,
        mutation_pieces,
        [mutation_piece_index]
    )

    // must apply escape macro since we need valid SQL AST
    apply_escape_macro_to_query_part(orma_schema, table, where)

    const $set = Object.keys(mutation_piece.record)
        .map(column => {
            if (identifying_columns.includes(column)) {
                return undefined
            }

            const resolved_value = get_resolved_mutation_value_if_column(
                mutation_pieces,
                guid_map,
                mutation_piece.record,
                column
            )
            if (resolved_value === undefined) {
                return undefined
            }
            const escaped_value = orma_escape(
                resolved_value,
                orma_schema.tables[table].database_type
            )

            return [column, escaped_value]
        })
        .filter(el => el !== undefined)

    return $set.length === 0
        ? undefined
        : {
              $update: table,
              $set,
              $where: where
          }
}

export const get_delete_ast = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[],
    piece_indices: number[],
    table: string,
    guid_map: GuidMap
) => {
    const $where = get_identifying_where(
        orma_schema,
        guid_map,
        mutation_pieces,
        piece_indices
    )
    // must apply escape macro since we need valid SQL AST
    apply_escape_macro_to_query_part(orma_schema, table, $where)

    const ast = {
        $delete_from: table,
        $where
    }

    return ast
}

export const throw_identifying_key_errors = (
    operation: string,
    identifying_keys: string[],
    path: (string | number)[]
) => {
    if (!identifying_keys || identifying_keys.length === 0) {
        throw {
            message: `Could not find primary keys or unique keys in record to ${operation}`,
            path: path,
            additional_info: {
                identifying_columns: identifying_keys
            }
        } as OrmaError
    }
}
