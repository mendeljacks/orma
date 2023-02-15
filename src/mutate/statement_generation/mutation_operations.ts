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
import { generate_record_where_clause } from '../helpers/record_searching'
import { ValuesByGuid } from '../mutate'
import { MutationPiece } from '../plan/mutation_plan'
import { json_to_sql } from '../../query/json_sql'

export const get_create_ast = (
    mutation_pieces: MutationPiece[],
    entity: string,
    values_by_guid: Record<any, any>,
    orma_schema: OrmaSchema
) => {
    // get insert keys by combining the keys from all records
    const fields = mutation_pieces.reduce((acc, mutation_piece, i) => {
        Object.keys(mutation_piece.record).forEach(field => {
            // filter lower tables and keywords such as $operation from the sql
            const resolved_value = get_resolved_mutation_value_if_field(
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

    const values = mutation_pieces.map((mutation_piece, i) => {
        const record_values = [...fields].flatMap(field => {
            const resolved_value = get_resolved_mutation_value_if_field(
                mutation_piece.record,
                field,
                values_by_guid
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
    field: string,
    values_by_guid: Record<any, any>
) => {
    // dont process submutations or keywords such as $operation
    if (Array.isArray(record[field]) || is_reserved_keyword(field)) {
        return undefined
    }

    const resolved_value = get_resolved_mutation_value(
        record,
        field,
        values_by_guid
    )
    return resolved_value?.$guid === undefined ? resolved_value : undefined
}

export const get_resolved_mutation_value = (
    record: Record<string, any>,
    field: string,
    values_by_guid: Record<any, any>
) => {
    const value = record[field]

    const has_guid = value?.$guid !== undefined
    if (has_guid) {
        const guid_value = values_by_guid[value.$guid]
        // return the { $guid } object if there is nothing in the values_by_guid
        const resolved_value = guid_value === undefined ? value : guid_value
        return resolved_value
    } else {
        return value
    }
}

export const get_update_ast = (
    mutation_piece: MutationPiece,
    values_by_guid: Record<any, any>,
    orma_schema: OrmaSchema
) => {
    const entity = path_to_entity(mutation_piece.path)

    const { identifying_keys, where } = generate_record_where_clause(
        mutation_piece,
        values_by_guid,
        orma_schema,
        false
    )

    // must apply escape macro since we need valid SQL AST
    apply_escape_macro_to_query_part(orma_schema, entity, where)

    const $set = Object.keys(mutation_piece.record)
        .map(field => {
            if (identifying_keys.includes(field)) {
                return undefined
            }

            const resolved_value = get_resolved_mutation_value_if_field(
                mutation_piece.record,
                field,
                values_by_guid
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
    mutation_pieces: MutationPiece[],
    entity: string,
    values_by_guid: ValuesByGuid,
    orma_schema: OrmaSchema
) => {
    const wheres = mutation_pieces.map(mutation_piece => {
        const { where } = generate_record_where_clause(
            mutation_piece,
            values_by_guid,
            orma_schema,
            false
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
