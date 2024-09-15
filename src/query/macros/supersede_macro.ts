import { mutation_path_to_table } from '../..'
import {
    get_direct_edge,
    get_primary_keys,
    is_parent_table,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../schema/schema_types'
import { mutation_table_deep_for_each } from '../../mutate/helpers/mutate_helpers'
import { OrmaMutation } from '../../types/mutation/mutation_types'

const get_direct_pk = (table: string, orma_schema: OrmaSchema): string => {
    const pk_candidates = get_primary_keys(table, orma_schema)

    if (pk_candidates.length !== 1) {
        throw new Error(
            `Could not find single column to use as primary key. Table ${table} has ${pk_candidates.length} primary keys`
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
    // hack to pretend mutation_table_deep_for_each supported async
    await new Promise((resolve, reject) => {
        let supersede_count = 0
        mutation_table_deep_for_each(mutation, async (value, path) => {
            if (value.$supersede?.length > 0) {
                supersede_count += 1
            }
        })

        if (supersede_count === 0) {
            resolve(undefined)
        }
        mutation_table_deep_for_each(mutation, async (value, path) => {
            if (value.$supersede?.length > 0) {
                supersede_count -= 1
                const supersedes = value.$supersede
                const table = mutation_path_to_table(path)

                const pk = get_direct_pk(table, orma_schema)

                const pk_value = value[pk]

                if (pk_value === undefined) {
                    throw new Error(
                        `Supersede macro requires primary key of ${table} to be provided so that children rows can be superseded`
                    )
                }

                const selects = supersedes.reduce(
                    (acc, child_table: string) => {
                        const is_parent = is_parent_table(
                            table,
                            child_table,
                            orma_schema
                        )
                        if (!is_parent) {
                            throw new Error(
                                `Supersede macro can only be applied to tables that are parents of the table being superseded. ${table} is not a parent of ${child_table}`
                            )
                        }

                        const fk = get_direct_edge(
                            table,
                            child_table,
                            orma_schema
                        )
                        const child_pk = get_direct_pk(
                            child_table,
                            orma_schema
                        )

                        return {
                            ...acc,
                            [child_table]: {
                                $select: [child_pk],
                                $where: {
                                    $eq: [fk.to_columns, { $escape: pk_value }],
                                },
                            },
                        }
                    },
                    {}
                )

                const query = await orma_query(selects)

                supersedes.forEach((child_table: string) => {
                    const deletes =
                        query[child_table]?.map(row => ({
                            $operation: 'delete',
                            ...row,
                        })) || []

                    const creates =
                        value[child_table]?.map(row => ({
                            $operation: 'create',
                            ...row,
                        })) || []
                    value[child_table] = [...deletes, ...creates]
                    delete value['$supersede']
                })

                if (supersede_count === 0) {
                    resolve(undefined)
                }
            }
        })
    })
}
