import { orma_escape } from '../helpers/escape'
import { clone, last } from '../helpers/helpers'
import { push_path } from '../helpers/push_path'
import { OrmaSchema } from '../introspector/introspector'
import { combine_wheres } from '../query/query_helpers'
import { Path } from '../types'
import {
    save_guids,
    sort_database_rows,
} from './helpers/add_foreign_key_indexes'
import { get_identifying_keys } from './helpers/identifying_keys'
import { mutation_entity_deep_for_each } from './helpers/mutate_helpers'
import { apply_inherit_operations_macro } from './macros/inherit_operations_macro'
import {
    get_create_ast,
    get_delete_ast,
    get_update_ast,
    throw_identifying_key_errors,
} from './macros/operation_macros'
import { apply_guid_inference_macro } from './macros/guid_inference_macro'
import {
    get_mutation_plan,
    MutationPiece,
    run_mutation_plan,
} from './plan/mutation_plan'

export type MutationOperation = 'create' | 'update' | 'delete'
export type operation = MutationOperation | 'query'
export type mysql_fn = (statements) => Promise<Record<string, any>[][]>
export type statements = {
    sql_ast: Record<any, any>
    sql_string: string
    route: string[]
    operation: operation
    paths: (string | number)[][]
}[]

export type ValuesByGuid = Record<string | number, any>
export const orma_mutate = async (
    input_mutation,
    mysql_function: mysql_fn,
    orma_schema: OrmaSchema
) => {
    // clone to allow macros to mutate the mutation without changing the user input mutation object
    const mutation = clone(input_mutation)

    const values_by_guid: ValuesByGuid = {}

    apply_inherit_operations_macro(mutation)
    apply_guid_inference_macro(mutation, orma_schema)

    const mutation_plan = get_mutation_plan(mutation, orma_schema)

    run_mutation_plan(mutation_plan, async ({ mutation_pieces }) => {
        const { mutation_ast_infos, query_asts } = get_ast_infos(
            mutation_pieces,
            values_by_guid,
            orma_schema
        )

        if (mutation_ast_infos.length > 0) {
            await mysql_function(mutation_ast_infos)
        }

        if (query_asts.length > 0) {
            const query_results = await mysql_function(query_asts)
            const sorted_database_rows = sort_database_rows(
                mutation_pieces,
                query_asts,
                query_results,
                orma_schema
            )
            save_guids(values_by_guid, mutation_pieces, sorted_database_rows)
        }
    })

    replace_guids_with_values(mutation, values_by_guid)
    return mutation
}

/**
 * MUTATES THE INPUT MUTATION
 */
const replace_guids_with_values = (
    mutation: any,
    values_by_guid: ValuesByGuid
) => {
    mutation_entity_deep_for_each(mutation, (record, path) => {
        Object.keys(record).forEach(field => {
            const guid = record[field]?.$guid
            if (guid !== undefined) {
                const guid_value = values_by_guid[guid]
                record[field] = guid_value
            }
        })
    })
}

export type AstInfo = {
    ast: Record<string, any>
    operation: operation
    entity: string
    records: Record<string, any>[]
    paths: Path[]
}

export const get_ast_infos = (
    input_mutation_pieces: MutationPiece[],
    values_by_guid: Record<any, any>,
    orma_schema: OrmaSchema
) => {
    const grouped_mutation = get_grouped_mutation(input_mutation_pieces)

    const mutation_ast_infos = Object.keys(grouped_mutation).flatMap(entity =>
        Object.keys(grouped_mutation[entity]).flatMap(
            (operation: MutationOperation) => {
                const group_pieces = grouped_mutation[entity][operation]
                return get_mutation_ast_infos(
                    group_pieces,
                    operation,
                    entity,
                    values_by_guid,
                    orma_schema
                )
            }
        )
    )

    const query_asts = Object.keys(grouped_mutation).flatMap(entity => {
        const create_pieces = grouped_mutation[entity].create ?? []
        const update_pieces = grouped_mutation[entity].update ?? []
        const group_pieces = [...create_pieces, ...update_pieces]
        const guid_query = get_guid_query(group_pieces, entity, orma_schema)
        return guid_query ? [guid_query] : []
    })

    return { mutation_ast_infos, query_asts }
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

const get_mutation_ast_infos = (
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
        asts = [get_delete_ast(mutation_pieces, entity, orma_schema)]
    } else {
        throw new Error(`Unrecognized $operation ${operation}`)
    }

    return asts
        .filter(ast => ast !== undefined) // can be undefined if there is nothing to do, e.g. a stub update
        .map(ast => ({
            ast,
            operation,
            entity,
            mutation_pieces,
        }))
}

type GroupedMutation = {
    [Entity in string]?: {
        [Operation in MutationOperation]?: MutationPiece[]
    }
}

export const get_guid_query = (
    input_mutation_pieces: MutationPiece[],
    entity: string,
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
            orma_schema,
            true // we dont mind if the unique key is ambiguous, since the choice of key doesnt do anything
            // (unlike in an update, where it determines which fields are modified). We just select any key in
            // a repeatable way so we can do row matching later
        )
        identifying_keys.forEach(key => all_identifying_keys.add(key))

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

export const generate_record_where_clause = (
    mutation_piece: MutationPiece,
    orma_schema: OrmaSchema,
    allow_ambiguous_unique_keys: boolean = false
) => {
    const { record, path } = mutation_piece
    const entity_name = path_to_entity(path)

    const identifying_keys = get_identifying_keys(
        entity_name,
        record,
        orma_schema,
        allow_ambiguous_unique_keys
    )

    // throw if we cant find a unique key
    throw_identifying_key_errors(record.$operation, identifying_keys, path)

    const where_clauses = identifying_keys.map(key => ({
        $eq: [key, orma_escape(record[key])],
    }))

    const where =
        where_clauses.length > 1
            ? {
                  $and: where_clauses,
              }
            : where_clauses?.[0]

    return { where, identifying_keys }
}

export const path_to_entity = (path: (number | string)[]) => {
    return typeof last(path) === 'number'
        ? (path[path.length - 2] as string)
        : (last(path) as string)
}
