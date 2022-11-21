import { mutation_path_to_entity } from '../..'
import { OrmaError } from '../../helpers/error_handling'
import {
    array_equals,
    group_by,
    key_by,
    map_object,
} from '../../helpers/helpers'
import {
    get_child_edges,
    get_primary_keys,
    reverse_edge,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { orma_query } from '../../query/query'
import { combine_wheres } from '../../query/query_helpers'
import { PathedRecord } from '../../types'
import { OrmaQuery, WhereConnected } from '../../types/query/query_types'
import { sort_database_rows } from '../database_results/sort_database_rows'
import { get_identifying_keys } from '../helpers/identifying_keys'
import { path_to_entity } from '../helpers/mutate_helpers'
import {
    generate_record_where_clause,
    generate_record_where_clause_from_identifying_keys,
} from '../helpers/record_searching'
import { MysqlFunction } from '../mutate'
import {
    flatten_mutation,
    MutationPiece,
    MutationPlan,
} from '../plan/mutation_plan'

/* 
Description:
Create errors for any records connected to a delete in the mutation, where that record is not also being deleted. This
avoids getting mysql errors, or leaking ids that are not accessible.

ALgorithm:
- For each entity, remember all relevant identifying keys, that is all identifying fields that appear on at least
    one delete for that entity
- Fetch all records that have at least one parent in the mutation as a delete. Select all relevant
    identifying keys (e.g. if the child is 'users', select all identifying keys for 'users', that is all identifying keys
    that is on a user in the mutation)
- Match child records with records in the mutation
- Generate errors. Any child that is unmatched will block the delete. Matched children can be ignored

Notes:
- Can allow users to know that an id exists, even if that ID is not viewable due to connected records (multitenancy). 
    For example, if a post_group is owned by all the posts that reference it, then deleting the post_group will generate 
    an error message with all the posts inside it, even if some of those posts should be hidden.
- Doesn't handle creates and deletes interacting (e.g. create a post and delete that post's user in the same mutation).
    This case will result in an SQL error if the create is run first
- Doesn't handle udpates and deletes interacting (not sure if this can even happen, but its not supported)




- only works with primary keys (for now. I think there should be a macro that fills in primary keys, then
    everything should work off of primary keys, so that there is not so much complex logic repeated everywhere,
    and so much extra computation to make multiple caches for each identifying key etc, even though this does
    mean an extra request that is technically not necessary)

*/

export const get_delete_verification_errors = async (
    orma_schema: OrmaSchema,
    mysql_function: MysqlFunction,
    mutation_plan: Pick<MutationPlan, 'mutation_pieces'>
) => {
    const query = get_delete_verification_query(
        orma_schema,
        mutation_plan.mutation_pieces
    )
    const results = await orma_query(query, orma_schema, mysql_function)
    const blocking_pieces = get_mutation_pieces_blocing_delete(
        orma_schema,
        mutation_plan.mutation_pieces,
        results
    )
    const errors = get_delete_errors_from_blocking_rows(
        orma_schema,
        blocking_pieces
    )
    return errors
}

export const get_delete_mutation_pieces_by_entity = (
    mutation_plan: Pick<MutationPlan, 'mutation_pieces'>
) => {
    const delete_pieces = mutation_plan.mutation_pieces.filter(
        el => el.record.$operation === 'delete'
    )

    const delete_pieces_by_entity = group_by(delete_pieces, el =>
        mutation_path_to_entity(el.path)
    )

    return delete_pieces_by_entity
}

export const get_delete_verification_query = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[]
) => {
    const delete_pieces = mutation_pieces.filter(
        el => el.record.$operation === 'delete'
    )

    const delete_pieces_by_entity = group_by(delete_pieces, el =>
        mutation_path_to_entity(el.path)
    )

    const identifying_fields_by_entity = map_object(
        delete_pieces_by_entity,
        (entity, entity_mutation_pieces, i) => {
            const identifying_keys = entity_mutation_pieces.flatMap(
                ({ record }) =>
                    get_identifying_keys(
                        entity,
                        record,
                        {}, // since this happens before the mutation runs, the guid lookup is empty
                        orma_schema,
                        false // since we are dealing with delete records, the identifying keys should be unambiguous
                    )
            )
            return [entity, new Set(identifying_keys)]
        }
    )

    const parent_entities = Object.keys(identifying_fields_by_entity)
    // - generate an object with keys that are child entities, and value that is an array of edges to parents in mutation
    // - map that object to keys being child entities and values the where clauses generated by those edges
    //     - each edge turns into an $in $where, so children are returned that are connected to a parent in the mutation

    const edges_to_parents = parent_entities.flatMap(parent_entity => {
        const child_edges = get_child_edges(parent_entity, orma_schema)
        const edges_to_parent = child_edges.map(reverse_edge)
        return edges_to_parent
    })

    const edges_to_parent_by_child_entity = group_by(
        edges_to_parents,
        edge => edge.from_entity
    )

    const query: any = map_object(
        edges_to_parent_by_child_entity,
        (child_entity, edges_to_parent, i) => {
            const child_wheres = edges_to_parent.map(edge_to_parent => {
                const parent_entity = edge_to_parent.to_entity
                const parent_pieces = delete_pieces_by_entity[parent_entity]

                const parent_wheres = parent_pieces.map(parent_piece => {
                    const where = generate_record_where_clause(
                        parent_piece,
                        {},
                        orma_schema,
                        false,
                        true
                    )?.where!

                    return where
                })

                const child_where = {
                    $in: [
                        edge_to_parent.from_field,
                        {
                            $select: [edge_to_parent.to_field],
                            $from: parent_entity,
                            $where: combine_wheres(parent_wheres, '$or'),
                        },
                    ],
                }

                return child_where
            })

            const relevant_child_fields = [
                ...new Set([
                    ...get_primary_keys(child_entity, orma_schema),
                    ...(identifying_fields_by_entity?.[child_entity] ?? []),
                ]),
            ]

            return [
                child_entity,
                {
                    $select: relevant_child_fields,
                    $from: child_entity,
                    $where: combine_wheres(child_wheres, '$or'),
                },
            ]
        }
    )

    return query
}

const get_result_id_string = (
    orma_schema: OrmaSchema,
    entity: string,
    record: Record<string, any>
) => {
    const primary_keys = get_primary_keys(entity, orma_schema)
    const values = primary_keys.map(key => record[key])
    const id_string = JSON.stringify([entity, values])
    return id_string
}

export const get_mutation_pieces_blocing_delete = (
    orma_schema: OrmaSchema,
    mutation_pieces: MutationPiece[],
    results: Record<string, Record<string, any>[]>
) => {
    const delete_pieces = mutation_pieces.filter(
        el => el.record.$operation === 'delete'
    )

    const result_entities = Object.keys(results)
    const result_record_groups = result_entities.map(entity => results[entity])

    const matched_results = sort_database_rows(
        delete_pieces,
        result_entities,
        result_record_groups,
        {},
        orma_schema
    )

    const matched_primary_key_values = matched_results.reduce<Set<string>>(
        (acc, matched_result, i) => {
            if (!matched_result) {
                return acc
            }

            const id_string = get_result_id_string(
                orma_schema,
                path_to_entity(delete_pieces[i].path),
                matched_result
            )
            acc.add(id_string)

            return acc
        },
        new Set()
    )

    const blocking_pathed_records = result_record_groups.flatMap(
        (result_records, i) => {
            const entity = result_entities[i]

            const blocked_records = result_records.flatMap(result_record => {
                const id_string = get_result_id_string(
                    orma_schema,
                    entity,
                    result_record
                )

                if (matched_primary_key_values.has(id_string)) {
                    return []
                } else {
                    return [result_record]
                }
            })

            const pathed_records: PathedRecord[] = blocked_records.map(
                (record, i) => ({
                    record,
                    path: [entity, i],
                })
            )

            return pathed_records
        }
    )

    return blocking_pathed_records
}

export const get_delete_errors_from_blocking_rows = (
    orma_schema: OrmaSchema,
    blocking_pathed_records: PathedRecord[]
): OrmaError[] => {
    const errors = blocking_pathed_records.map(({ record, path }) => {
        const entity = path_to_entity(path ?? [])
        const primary_keys = get_primary_keys(entity, orma_schema)
        const primary_key_values = primary_keys.map(key => record[key])

        const errors: OrmaError = {
            message: `Cannot delete record because ${entity} ${primary_key_values.join(
                ', '
            )} is undeleted.`,
            path: [],
            additional_info: {
                record,
                entity,
            },
        }

        return errors
    })

    return errors
}
