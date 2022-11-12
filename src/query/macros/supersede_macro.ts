import { escapeId } from 'sqlstring'
import { is_simple_object, last } from '../../helpers/helpers'
import {
    get_direct_edge,
    get_direct_edges,
    is_reserved_keyword,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import {
    get_identifying_keys,
    get_possible_identifying_keys,
} from '../../mutate/helpers/identifying_keys'
import { mutation_entity_deep_for_each } from '../../mutate/helpers/mutate_helpers'
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
            const entities = value.$supersede

            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i]

                const possible_identifying_keys = get_possible_identifying_keys(
                    entity,
                    orma_schema
                )

                const rows = value[entity]
                if (rows?.length === undefined) {
                    throw new Error(
                        `Supersede macro requires an array of rows for entity ${entity}`
                    )
                }

                // get parent entities
                // ensure that there is no ambiguity if there are two parents which it should supersede by connected

                // await orma_query({
                //     [entity]: {
                //         id: true,
                //         $where: {
                //             id = parent,
                //         },
                //     },
                // })

                // get all rows connected to parent entity
                // compare with each row in a lirjoin

                debugger
                // const supersede_query = {
                //     [entity]: {}
                // }

                // const supersede_result = orma_query(supersede_query)

                // Object.assign(value, supersede_result[entity_name][0])
            }

            delete value.$supersede
        }
    })
}
