import { combine_wheres } from '../../query/query_helpers'
import { PathedRecord } from '../../types'
import { OrmaSchema } from '../../schema/schema_types'
import { GuidMap } from '../macros/guid_plan_macro'
import { get_identifying_columns } from '../macros/identifying_columns_macro'
import { MutationPiece } from '../plan/mutation_batches'
import { path_to_table } from './mutate_helpers'

export const get_identifying_where = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: PathedRecord[],
    mutation_piece_indices: number[],
    get_identifying_columns: typeof get_identifying_columns_from_record = get_identifying_columns_from_record
) => {
    const values_by_columns = mutation_piece_indices.reduce(
        (acc, mutation_piece_index) => {
            const mutation_piece = mutation_pieces[mutation_piece_index]

            const identifying_columns = get_identifying_columns(
                orma_schema,
                mutation_piece
            )
            const values = identifying_columns.map(column =>
                get_search_value(
                    orma_schema,
                    guid_map,
                    mutation_pieces,
                    mutation_piece_index,
                    column
                )
            )

            const columns_string = JSON.stringify(identifying_columns)

            if (!acc[columns_string]) {
                acc[columns_string] = []
            }

            acc[columns_string].push(values.length === 1 ? values[0] : values)
            return acc
        },
        {} as Record<string, unknown[]>
    )

    const ors = Object.entries(values_by_columns).map(
        ([column_string, value]) => {
            // handle combinations of multiple or single columns / values, and use $eq if possible
            // instead of $in. This is for simplicity of the output query and it might help
            // sql optimization (just a guess but I wouldnt be surprised)
            const columns = JSON.parse(column_string)
            const column_parameter = columns.length === 1 ? columns[0] : columns
            const value_parameter = value.length === 1 ? value[0] : value
            const keyword = value.length === 1 ? '$eq' : '$in'
            return { [keyword]: [column_parameter, value_parameter] }
        }
    )

    // if there are no identifying columns, it will return and let the caller deal with the case,
    // for example not calling the query function at all if there is no where clause
    const where = combine_wheres(ors, '$or')

    return where
}

const get_identifying_columns_from_record = (
    orma_schema: OrmaSchema,
    mutation_piece: PathedRecord
): string[] => {
    const table = path_to_table(mutation_piece.path ?? [])
    return (
        mutation_piece.record.$identifying_columns ??
        get_identifying_columns(
            orma_schema,
            table,
            mutation_piece.record,
            // searching a record with no $identifying_columns is only for creates. In these cases,
            // we dont care if the key is ambiguous, we just want some consistent choice to fetch
            // things like ids from the database
            true
        )
    )
}

const get_search_value = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: PathedRecord[],
    mutation_piece_index: number,
    column: string
) => {
    const { record } = mutation_pieces[mutation_piece_index]
    const guid = record[column]?.$guid

    // basic case has no guids
    const no_guid = guid === undefined
    if (no_guid) {
        return { $escape: record[column] }
    }

    // use the resolved value if there is one. Sometimes we must use a resolved value, for
    // example auto-generated ids that cannot be searched for before the database actually
    // generates them. Additionally, its more efficient to use a resolved value if it is already
    // in scope
    const has_resolved_value = record[column].$resolved_value !== undefined
    if (has_resolved_value) {
        return { $escape: record[column].$resolved_value }
    }

    // if there is a guid, and its a $read guid, we have to search based on the corresponding
    // $write guid
    const has_read_guid = record[column]?.$read
    if (has_read_guid) {
        const write_info = guid_map.get(guid)?.write!
        const write_piece = mutation_pieces[write_info.piece_index]

        // case 1: the write guid already has a resolved value, use that.
        const write_resolved_value =
            write_piece.record[write_info.column]?.$resolved_value
        if (write_resolved_value !== undefined) {
            return { $escape: write_resolved_value }
        }

        // case 2: the write guid has not been resolved yet. This means that we need to do a
        // db-side search for the value. Note, this should never happen for creates
        // since create records do not exist in the db yet
        if (!write_piece.record.$identifying_columns) {
            throw new Error(
                `Identifying guid '${guid}' for column '${column}' resolved to a record that could not be identified (maybe it is not yet in the database, or does not have an unambiguous identifier such as a primary key). Try using a hardcoded '${column}'.`
            )
        }
        const write_identifying_where = get_identifying_where(
            orma_schema,
            guid_map,
            mutation_pieces,
            [write_info.piece_index]
        )
        return {
            $select: [write_info.column],
            $from: path_to_table(write_piece.path!),
            $where: write_identifying_where,
        }
    }

    throw new Error('Something went wrong with generating identifying where.')
}

export const generate_identifying_where = (
    orma_schema: OrmaSchema,
    guid_map: GuidMap,
    mutation_pieces: MutationPiece[],
    identifying_columns: string[],
    mutation_piece_index: number
) => {
    const { path, record } = mutation_pieces[mutation_piece_index]

    const where_clauses = identifying_columns.map(key => {
        const guid = record[key]?.$guid
        if (guid === undefined) {
            // if there is no guid, we just search the raw value
            return {
                $eq: [key, { $escape: record[key] }],
            }
        } else if (record[key].$resolved_value !== undefined) {
            // use the resolved value if there is one. Sometimes we must use a resolved value, for
            // example auto-generated ids that cannot be searched for before the database actually
            // generates them. Additionally, its more efficient to use a resolved value if it is already
            // in scope
            return {
                $eq: [key, { $escape: record[key].$resolved_value }],
            }
        } else {
            // if there is a guid, we have to search based on where the guid writes from. This allows
            // us to identify records based on a read guid column.
            const write_info = guid_map.get(guid)?.write!
            const write_piece = mutation_pieces[write_info.piece_index]

            // case 1: the write guid already has a resolved value, use that.
            const write_resolved_value =
                write_piece.record[write_info.column]?.$resolved_value
            if (write_resolved_value !== undefined) {
                return {
                    $eq: [key, { $escape: write_resolved_value }],
                }
            }

            // case 2: the write guid has a guid, but it has not been resolved yet. This means that
            // we need to do a db-side search for the value. Note, this should never happen for creates
            // since create records do not exist in the db yet
            if (!write_piece.record.$identifying_columns) {
                throw new Error(
                    `Identifying guid '${guid}' for column '${key}' resolved to a record that could not be identified (maybe it is not yet in the database, or does not have an unambiguous identifier such as a primary key). Try using a hardcoded ${key}.`
                )
            }
            const write_identifying_where = generate_identifying_where(
                orma_schema,
                guid_map,
                mutation_pieces,
                write_piece.record.$identifying_columns,
                write_info.piece_index
            )
            return {
                $in: [
                    key,
                    {
                        $select: [write_info.column],
                        $from: path_to_table(
                            mutation_pieces[write_info.piece_index].path!
                        ),
                        $where: write_identifying_where,
                    },
                ],
            }
        }
    })

    // this will not be undefined if identifying_keys is not empty, which is assumed true
    const where = combine_wheres(where_clauses, '$and') ?? {}

    return where
}