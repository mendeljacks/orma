import {
    array_equals,
    array_set_equals,
    key_by,
    to_sorted
} from '../../helpers/helpers'
import { OrmaSchema } from '../../schema/schema_types'
import { path_to_table } from '../helpers/mutate_helpers'
import { GuidMap } from '../macros/guid_plan_macro'
import {
    get_identifying_columns,
    get_possible_identifying_keys
} from '../macros/identifying_columns_macro'
import {
    MutationBatch,
    MutationPiece,
    mutation_batch_for_each
} from '../plan/mutation_batches'

type DatabaseIndexesByTable = {
    [Table: string]: {
        [stringified_values: string]: Record<string, any>
    }[]
}

export const sort_database_rows = (
    mutation_pieces: MutationPiece[],
    guid_map: GuidMap,
    mutation_batch: MutationBatch | number[],
    query_tables: string[],
    query_results: Record<string, any>[][],
    orma_schema: OrmaSchema
) => {
    if (query_results.length !== query_tables.length) {
        throw new Error(
            'Mysql function should return one array of rows per query'
        )
    }

    const database_indexes_by_table = get_database_indexes_by_table(
        query_tables,
        query_results,
        orma_schema
    )

    const sorted_database_rows = sort_database_rows_given_indexes(
        mutation_pieces,
        guid_map,
        mutation_batch,
        database_indexes_by_table,
        orma_schema
    )

    return sorted_database_rows
}

const get_database_indexes_by_table = (
    query_tables: string[],
    query_results: Record<string, any>[][],
    orma_schema: OrmaSchema
) => {
    const database_indexes_by_table =
        query_tables.reduce<DatabaseIndexesByTable>(
            (acc, table, query_index) => {
                const possible_identifying_keys = get_possible_identifying_keys(
                    orma_schema,
                    table
                )
                const database_rows = query_results[query_index]
                const database_row_indexes = possible_identifying_keys.map(
                    identifying_key => {
                        const relevant_database_rows = database_rows.filter(
                            row =>
                                identifying_key.every(
                                    key => row[key] !== undefined
                                )
                        )
                        const index = key_by(relevant_database_rows, db_row =>
                            // we chose the unique key such that none of its columns are nullable, and they are all actually
                            // supplied in the mutation. Therefore we can safely stringify without worrying about null values getting
                            // lost, or collisions between two rows that both have null columns (mysql allows this on unique indexes)
                            values_to_key(
                                identifying_key.map(column => db_row[column])
                            )
                        )
                        return index
                    }
                )

                if (acc[table] === undefined) {
                    acc[table] = []
                }
                acc[table].push(...database_row_indexes)
                return acc
            },
            {}
        )

    return database_indexes_by_table
}

const sort_database_rows_given_indexes = (
    mutation_pieces: MutationPiece[],
    guid_map: GuidMap,
    mutation_batch: MutationBatch | number[],
    database_indexes_by_table: DatabaseIndexesByTable,
    orma_schema: OrmaSchema
) => {
    let ordered_database_rows: (Record<string, any> | undefined)[] = []
    mutation_batch_for_each(
        mutation_pieces,
        mutation_batch,
        ({ record, path }, mutation_piece_index) => {
            const database_row = get_database_row_for_mutation_piece(
                mutation_pieces,
                guid_map,
                database_indexes_by_table,
                orma_schema,
                mutation_piece_index
            )
            ordered_database_rows.push(database_row)
        }
    )

    return ordered_database_rows
}

const get_database_row_for_mutation_piece = (
    mutation_pieces: MutationPiece[],
    guid_map: GuidMap,
    database_indexes_by_table: DatabaseIndexesByTable,
    orma_schema: OrmaSchema,
    mutation_piece_index: number
) => {
    const { record, path } = mutation_pieces[mutation_piece_index]
    const table = path_to_table(path)

    // this can happen if all data is provided by the user so there is no query to get more data about this record
    if (!database_indexes_by_table[table]) {
        return undefined
    }

    // if identifying columns are given (like for upsert, this can be important), use those. Sometimes there
    // wont be identifying columns (like for creates), so just figure one out since we only need it to match records,
    // not actually change anything in the database
    const identifying_keys =
        record?.$identifying_columns ??
        get_identifying_columns(
            orma_schema,
            table,
            record,
            true // we dont mind if the unique key is ambiguous, since the choice of key doesnt do anything
            // (unlike in an actual update, where it determines which columns are modified). We just select any key in
            // the same way as was selected for the query
        )

    // this can happen if the operation is none and no identifying columns are given
    if (!identifying_keys) {
        return {}
    }

    const possible_identifying_keys = get_possible_identifying_keys(
        orma_schema,
        table
    )
    const identifying_key_index = possible_identifying_keys.findIndex(keys =>
        array_set_equals(keys, identifying_keys)
    )

    const identifying_values = identifying_keys.map(column => {
        const value = record[column]

        const has_guid = value?.$guid !== undefined
        if (has_guid && value?.$read) {
            const { piece_index, column } = guid_map.get(value.$guid)!.write

            // if sort_database_rows is called during mutation execution, then the resolved value will be in scope.
            const mutation_resolved_value =
                mutation_pieces[piece_index].record[column]?.$resolved_value
            if (mutation_resolved_value !== undefined) {
                return mutation_resolved_value
            }

            // if sort_database_rows is called before the mutation runs, the resolved value is not in scope,
            // so extra data must be fetched (the tables that the guids point to should have been fetched),
            // so we do another lookup to get the fetched database row
            const write_database_row = get_database_row_for_mutation_piece(
                mutation_pieces,
                guid_map,
                database_indexes_by_table,
                orma_schema,
                piece_index
            )
            const database_resolved_value = write_database_row?.[column]

            return database_resolved_value
        } else {
            return value
        }
    })

    const database_index =
        database_indexes_by_table[table][identifying_key_index]
    const database_row = database_index[values_to_key(identifying_values)] ?? {}

    return database_row
}

// Make sure its sorted as order of keys doesnt matter -
// e.g. category_id, post_id is the same as post_id, category_id
// convert to string since mysql treats 123 the same as '123'
const values_to_key = (values: any[]) =>
    JSON.stringify(values.map(el => el?.toString() ?? null).sort())
