import { get_entity_names } from '../helpers/schema_helpers'
import { get_mutation_diff } from '../mutate/diff/diff_mutation'
import { OrmaMutation } from '../types/mutation/mutation_types'
import { OrmaQuery } from '../types/query/query_types'
import { OrmaSchema } from '../types/schema/schema_types'

type OrmaQueryFunction = (query: OrmaQuery<any, any>) => Promise<any>
type OrmaMutateFunction = (mutation: OrmaMutation<any>) => Promise<any>

const get_prepopulate_query = async (
    orma_query: OrmaQueryFunction,
    orma_schema: OrmaSchema
) => {
    let query = {}

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
            query[table_name] = diff[table_name]
        }
    }

    return query
}

export const prepopulate = async (
    orma_query: OrmaQueryFunction,
    orma_mutate: OrmaMutateFunction,
    orma_schema: OrmaSchema
) => {
    const prepopulate_query = await get_prepopulate_query(
        orma_query,
        orma_schema
    )

    try {
        await orma_mutate(prepopulate_query)
        Object.entries(prepopulate_query).forEach(
            async ([table_name, rows]: any) => {
                const create_count = rows.filter(
                    el => el.$operation === 'create'
                ).length
                const update_count = rows.filter(
                    el => el.$operation === 'update'
                ).length
                const delete_count = rows.filter(
                    el => el.$operation === 'delete'
                ).length

                create_count > 0 &&
                    console.log(
                        `Prepopulate: 🌱 ${create_count} rows added to ${table_name}`
                    )
                update_count > 0 &&
                    console.log(
                        `Prepopulate: ✏️ ${update_count} rows updated in ${table_name}`
                    )
                delete_count > 0 &&
                    console.log(
                        `Prepopulate: ✂️ ${delete_count} rows deleted in ${table_name}`
                    )
            }
        )
    } catch (error) {
        console.error(`Prepopulate: ❌ failed`)
        throw error
    }
}
