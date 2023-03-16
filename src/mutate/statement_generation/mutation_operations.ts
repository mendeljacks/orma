import { OrmaError } from '../../helpers/error_handling'
import { orma_escape } from '../../helpers/escape'
import {
    get_field_schema,
    is_reserved_keyword,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../types/schema/schema_types'
import { apply_escape_macro_to_query_part } from '../../query/macros/escaping_macros'
import { combine_wheres } from '../../query/query_helpers'
import { path_to_entity } from '../helpers/mutate_helpers'
import { ValuesByGuid } from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'
import { json_to_sql } from '../../query/json_sql'
import { generate_identifying_where } from '../helpers/record_searching'
import { GuidMap } from '../macros/guid_plan_macro'

export const get_create_ast = (
    mutation_pieces: MutationPiece[],
    entity: string,
    orma_schema: OrmaSchema
) => {
    // get insert keys by combining the keys from all records
    const fields = mutation_pieces.reduce((acc, mutation_piece, i) => {
        Object.keys(mutation_piece.record).forEach(field => {
            // filter lower tables and keywords such as $operation from the sql
            const resolved_value = get_resolved_mutation_value_if_field(
                mutation_piece.record,
                field
            )
            if (resolved_value !== undefined) {
                acc.add(field)
            }
        })

        return acc
    }, new Set() as Set<string>)

    const values = mutation_pieces.map((mutation_piece, i) => {
        const record_values = [...fields].flatMap(field => {
            const resolved_value = get_resolved_mutation_value_if_field(
                mutation_piece.record,
                field
            )

            const value_or_default =
                resolved_value === undefined
                    ? // run it through the ast parser to handle function defaults like $current_timestamp
                      json_to_sql(
                          get_field_schema(orma_schema, entity, field).$default
                      )
                    : resolved_value

            const escaped_value = orma_escape(
                value_or_default ?? null,
                orma_schema.$entities[entity].$database_type
            )
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

const get_resolved_mutation_value_if_field = (
    record: Record<string, any>,
    field: string
) => {
    // dont process submutations or keywords such as $operation
    if (Array.isArray(record[field]) || is_reserved_keyword(field)) {
        return undefined
    }

    const resolved_value = get_resolved_mutation_value(record, field)
    return resolved_value?.$guid === undefined ? resolved_value : undefined
}

export const get_resolved_mutation_value = (
    record: Record<string, any>,
    field: string
) => {
    const value = record[field]

    const has_guid = value?.$guid !== undefined
    if (has_guid) {
        const guid_value = value?.$resolved_value
        // return the { $guid } object if there is nothing in the values_by_guid
        const resolved_value = guid_value === undefined ? value : guid_value
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
    const entity = path_to_entity(mutation_piece.path)

    const identifying_fields = mutation_piece.record
        .$identifying_fields as string[]
    const where = generate_identifying_where(
        orma_schema,
        guid_map,
        mutation_pieces,
        identifying_fields,
        mutation_piece_index
    )

    // must apply escape macro since we need valid SQL AST
    apply_escape_macro_to_query_part(orma_schema, entity, where)

    const $set = Object.keys(mutation_piece.record)
        .map(field => {
            if (identifying_fields.includes(field)) {
                return undefined
            }

            const resolved_value = get_resolved_mutation_value_if_field(
                mutation_piece.record,
                field
            )
            if (resolved_value === undefined) {
                return undefined
            }
            const escaped_value = orma_escape(
                resolved_value,
                orma_schema.$entities[entity].$database_type
            )

            return [field, escaped_value]
        })
        .filter(el => el !== undefined)

    return $set.length === 0
        ? undefined
        : {
              $update: entity,
              $set,
              $where: where,
          }
}

export const get_delete_ast = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[],
    entity: string,
    guid_map: GuidMap
) => {
    const wheres = mutation_pieces.map((mutation_piece, piece_index) => {
        const identifying_fields = mutation_piece.record
            .$identifying_fields as string[]
        const where = generate_identifying_where(
            orma_schema,
            guid_map,
            mutation_pieces,
            identifying_fields,
            piece_index
        )

        // must apply escape macro since we need valid SQL AST
        apply_escape_macro_to_query_part(orma_schema, entity, where)

        return where
    })

    const $where = combine_wheres(wheres, '$or')

    const ast = {
        $delete_from: entity,
        $where,
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
                identifying_columns: identifying_keys,
            },
        } as OrmaError
    }
}
