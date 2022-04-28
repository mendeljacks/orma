import { array_equals, deep_get, key_by, last } from '../../helpers/helpers'
import { orma_schema } from '../../introspector/introspector'
import { throw_identifying_key_errors } from '../macros/operation_macros'
import { get_identifying_keys } from '../mutate'

/**
 * This function is used to index database records (e.g. containing foreign keys) by mutation paths. Specifically,
 * given a list of statements and results for those statements, generates an object where the keys are all the paths
 * contained in the statements and the values are the database rows matched with those paths. Matching paths with
 * database rows is done by checking equality with the values of the identifying keys gotten from
 * {@link get_identifying_keys}. Note that query results[i] should contain the results of all the paths in
 * planned_statements[i].paths.
 * Operates on one table at a time
 * Parallel arrays for planned_statements and query_results
 */
export const add_foreign_key_indexes = (
    planned_statements: {
        paths: (string | number)[][] // into the mutation
        route: string[]
    }[],
    query_results: Record<string, any>[][], // left list
    mutation: any, //right list
    orma_schema: orma_schema
) => {
    const tier_results = {}
    if (query_results.length !== planned_statements.length) {
        throw new Error(
            'Mysql function should return one array of rows per planned statement'
        )
    }

    planned_statements.forEach((planned_statement, i) => {
        const database_rows = query_results[i]
        const entity_name = last(planned_statement.route)
        const mutation_rows = planned_statement.paths.map(path =>
            deep_get(path, mutation, undefined)
        )

        // - we get a list of identifying keys for the mutation rows
        // - for each identifying key, we index the database rows by that key (so we end up with one
        //   index per key).
        // - we use these indexes to match database rows with mutation rows
        const unique_keys_set = new Set<string>()
        mutation_rows.forEach((mutation_row, i) => {
            const identifying_keys = get_identifying_keys(
                entity_name,
                mutation_row,
                orma_schema
            )

            throw_identifying_key_errors(
                'unknown',
                identifying_keys,
                planned_statement.paths[i],
                mutation
            )

            unique_keys_set.add(JSON.stringify(identifying_keys))
        })
        const all_identifying_keys: string[][] = [...unique_keys_set].map(el =>
            JSON.parse(el)
        )

        const database_row_indexes = all_identifying_keys.map(unique_key => {
            const index = key_by(database_rows, db_row =>
                // we chose the unique key such that none of its fields are nullable, and they are all actually
                // supplied in the mutation. Therefore we can safely stringify without worrying about null values getting
                // lost, or collisions between two rows that both have null fields (mysql allows this on unique indexes)
                JSON.stringify(unique_key.map(field => db_row[field]))
            )
            return index
        })

        // we order these so that ordered_database_rows[i] has the foreign keys of mutation_rows[i]
        const ordered_database_rows = mutation_rows.map(mutation_row => {
            // TODO: make all these get_identifying_leys calls more efficient by caching them
            const identifying_keys = get_identifying_keys(
                entity_name,
                mutation_row,
                orma_schema
            )
            const identifying_key_index = all_identifying_keys.findIndex(keys =>
                array_equals(keys, identifying_keys)
            )
            const database_row_index =
                database_row_indexes[identifying_key_index]
            const identifying_values = identifying_keys.map(
                key => mutation_row[key]
            )
            const database_row =
                database_row_index[JSON.stringify(identifying_values)]

            if (!database_row) {
                throw new Error(
                    `Could not find database row for mutation row with keys ${identifying_keys} and values ${identifying_values}`
                )
            }
            return database_row
        })

        ordered_database_rows.forEach((database_row, i) => {
            // paths is aligned with mutation_rows which is aligned with ordered_database_rows, which is why this
            // is justified
            const path = planned_statement.paths[i]
            tier_results[JSON.stringify(path)] = database_row
        })
    })

    return tier_results
}
/*
Comments:

How can the user mutate on renamed children (if they queried renamed fields, we can the query object to be the same as the mutate object. Myabe add $from to every query result and have mutate respect that? would add data though... Myabe user has to include the from manually, like from: 'name_of_real_table' or from: { $from_table: true })


{
    products
}

*/
