import { escapeId } from 'sqlstring'
import { mutation_path_to_entity } from '../..'
import { drop_last, is_simple_object, last } from '../../helpers/helpers'
import {
    get_direct_edge,
    get_direct_edges,
    get_primary_keys,
    is_parent_entity,
    is_reserved_keyword,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { get_foreign_keys_in_mutation } from '../../mutate/helpers/get_foreign_keys_in_mutation'
import {
    get_identifying_keys,
    get_possible_identifying_keys,
} from '../../mutate/helpers/identifying_keys'
import {
    get_higher_path,
    get_lower_mutation_pieces,
    mutation_entity_deep_for_each,
} from '../../mutate/helpers/mutate_helpers'
import { OrmaMutation } from '../../types/mutation/mutation_types'
import { OrmaQuery } from '../../types/query/query_types'
import { get_real_entity_name, get_real_higher_entity_name } from '../query'
import { is_subquery, query_for_each } from '../query_helpers'

/**
 * Applies the supersede macro. Mutates the input query
 */
export const apply_supersede_macro = async (
    mutation: OrmaMutation<any>,
    orma_query: Function,
    orma_schema: OrmaSchema
) => {
    mutation_entity_deep_for_each(mutation, (value, path) => {
        if (value.$supersede?.length > 0) {
            const supersedes = value.$supersede
            const entity = mutation_path_to_entity(path)
            const pk_candidates = get_primary_keys(entity, orma_schema)

            if (pk_candidates.length !== 1) {
                throw new Error(
                    `Supersede macro can only be applied to entities with a single primary key. Entity ${entity} has ${pk_candidates.length} primary keys`
                )
            }

            const pk = pk_candidates[0]
            const pk_value = value[pk]

            if (pk_value === undefined) {
                throw new Error(
                    `Supersede macro requires primary key of ${entity} to be provided so that children rows can be superseded`
                )
            }

            const query = supersedes.reduce((acc, val) => {
                const is_parent = is_parent_entity(entity, val, orma_schema)
                if (!is_parent) {
                    throw new Error(
                        `Supersede macro can only be applied to entities that are parents of the entity being superseded. ${entity} is not a parent of ${val}`
                    )
                }

                const fk = get_direct_edge(entity, val, orma_schema)

                return {
                    ...acc,
                    [val]: {
                        $select: column_names,
                        $where: {
                            $eq: [fk.to_field, { $escape: pk_value }],
                        },
                    },
                }
            }, {})

            debugger

            // const entities = value.$supersede

            // for (let i = 0; i < entities.length; i++) {
            //     const entity = entities[i]

            //     const lower_pieces = get_lower_mutation_pieces({
            //         path,
            //         record: value,
            //     })
            //     const fks = get_foreign_keys_in_mutation(
            //         mutation,
            //         path,
            //         orma_schema
            //     )
            //     const possible_identifying_keys = get_possible_identifying_keys(
            //         entity,
            //         orma_schema
            //     )

            //     const rows = value[entity]
            //     if (rows?.length === undefined) {
            //         throw new Error(
            //             `Supersede macro requires an array of rows for entity ${entity}`
            //         )
            //     }

            //     debugger
            //     // const supersede_query = {
            //     //     [entity]: {}
            //     // }

            //     // const supersede_result = orma_query(supersede_query)

            //     // Object.assign(value, supersede_result[entity_name][0])
            // }

            // delete value.$supersede
        }
    })
}
