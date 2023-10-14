import { get_entity_names } from '../helpers/schema_helpers'
import { get_mutation_diff } from '../mutate/diff/diff_mutation'
import { OrmaMutation } from '../types/mutation/mutation_types'
import { OrmaQuery } from '../types/query/query_types'
import { OrmaSchema } from '../types/schema/schema_types'

export const prepopulate = async (
    orma_query: (query: OrmaQuery<any, any>) => Promise<any>,
    orma_mutate: (mutation: OrmaMutation<any>) => Promise<any>,
    orma_schema: OrmaSchema
) => {
    const table_names = get_entity_names(orma_schema)

    for (const table_name of table_names) {
        const $prepopulate = orma_schema.$entities[table_name].$prepopulate
        if (!$prepopulate) continue

        const columns = Object.keys($prepopulate.rows[0]).reduce((acc, val) => {
            acc[val] = true
            return acc
        }, {})
        const result = await orma_query({ [table_name]: columns } as OrmaQuery<
            any,
            any
        >)

        let diff = get_mutation_diff(result, {
            [table_name]: $prepopulate.rows,
        })
        if (!$prepopulate.supercede) {
            diff[table_name] = diff[table_name]?.filter(
                el => el.$operation !== 'delete'
            )
        }

        if (diff[table_name]?.length > 0) {
            const create_count = diff[table_name].filter(
                el => el.$operation === 'create'
            ).length
            const update_count = diff[table_name].filter(
                el => el.$operation === 'update'
            ).length

            try {
                await orma_mutate(diff)
                console.log(
                    `✏️✏️✏️ Prepopulated ${table_name} with ${create_count} new rows and ${update_count} updated rows.`
                )
            } catch (error) {
                console.error(
                    `❌❌❌ Prepopulate failed for ${table_name} with ${create_count} new rows and ${update_count} updated rows.`
                )
                throw error
            }
        }
    }
}
