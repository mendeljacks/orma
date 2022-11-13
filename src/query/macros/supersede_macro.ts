import { mutation_path_to_entity } from '../..'
import {
    get_direct_edge,
    get_primary_keys,
    is_parent_entity,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { mutation_entity_deep_for_each } from '../../mutate/helpers/mutate_helpers'
import { OrmaMutation } from '../../types/mutation/mutation_types'

const get_direct_pk = (entity: string, orma_schema: OrmaSchema): string => {
    const pk_candidates = get_primary_keys(entity, orma_schema)

    if (pk_candidates.length !== 1) {
        throw new Error(
            `Could not find single column to use as primary key. Entity ${entity} has ${pk_candidates.length} primary keys`
        )
    }

    const pk = pk_candidates[0]

    return pk
}

/**
 * Applies the supersede macro. Mutates the input query
 */
export const apply_supersede_macro = async (
    mutation: OrmaMutation<any>,
    orma_query: Function,
    orma_schema: OrmaSchema
) => {
    mutation_entity_deep_for_each(mutation, async (value, path) => {
        if (value.$supersede?.length > 0) {
            const supersedes = value.$supersede
            const entity = mutation_path_to_entity(path)

            const pk = get_direct_pk(entity, orma_schema)

            const pk_value = value[pk]

            if (pk_value === undefined) {
                throw new Error(
                    `Supersede macro requires primary key of ${entity} to be provided so that children rows can be superseded`
                )
            }

            const selects = supersedes.reduce((acc, child_entity: string) => {
                const is_parent = is_parent_entity(
                    entity,
                    child_entity,
                    orma_schema
                )
                if (!is_parent) {
                    throw new Error(
                        `Supersede macro can only be applied to entities that are parents of the entity being superseded. ${entity} is not a parent of ${child_entity}`
                    )
                }

                const fk = get_direct_edge(entity, child_entity, orma_schema)
                const child_pk = get_direct_pk(child_entity, orma_schema)

                return {
                    ...acc,
                    [child_entity]: {
                        $select: [child_pk],
                        $where: {
                            $eq: [fk.to_field, { $escape: pk_value }],
                        },
                    },
                }
            }, {})

            const query = await orma_query(selects)

            supersedes.forEach((child_entity: string) => {
                const deletes = query[child_entity].map(row => ({
                    $operation: 'delete',
                    ...row,
                }))

                const creates = value[child_entity].map(row => ({
                    $operation: 'create',
                    ...row,
                }))
                value[child_entity] = [...deletes, ...creates]
                delete value['$supersede']
            })
        }
    })
}
