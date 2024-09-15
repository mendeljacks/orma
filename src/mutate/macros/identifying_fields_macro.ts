import { array_equals, array_set_equals } from '../../helpers/helpers'
import {
    get_primary_keys,
    get_unique_column_groups
} from '../../helpers/schema_helpers'
import { Path } from '../../types'
import { OrmaSchema } from '../../schema/schema_types'
import { path_to_table } from '../helpers/mutate_helpers'

export const apply_infer_identifying_columns_macro = (
    orma_schema: OrmaSchema,
    mutation_pieces: InferIdentifyingColumnsInput
) => {
    mutation_pieces.forEach(mutation_piece => {
        const operation = mutation_piece.record.$operation
        if (['update', 'delete', 'upsert'].includes(operation)) {
            const identifiny_columns = get_identifying_columns(
                orma_schema,
                path_to_table(mutation_piece.path),
                mutation_piece.record,
                false
            )

            if (mutation_piece.record.$identifying_columns === undefined) {
                mutation_piece.record.$identifying_columns = identifiny_columns
            }
        }
    })
}

export const get_identifying_columns = (
    orma_schema: OrmaSchema,
    table: string,
    record: Record<string, any>,
    allow_ambiguity: boolean
) => {
    const primary_keys = get_primary_keys(table, orma_schema)
    const can_use_primary_keys = primary_keys.every(column =>
        column_can_be_identifier(record, column)
    )

    if (can_use_primary_keys) {
        return primary_keys
    }

    const unique_keys = get_unique_column_groups(table, false, orma_schema)

    const useable_unique_keys = unique_keys.filter(unique_key =>
        unique_key.every(column => column_can_be_identifier(record, column))
    )

    if (allow_ambiguity || useable_unique_keys.length === 1) {
        // take shortest unique keys first, for faster mysql lookup
        return useable_unique_keys
            .slice()
            .sort((a, b) => a.length - b.length)[0]
    } else {
        return []
    }
}

const column_can_be_identifier = (
    record: Record<string, any>,
    column: string
) => {
    const value = record[column]

    // the column cannot be used as an identifier if it is not provided. Null also can't be used, since in
    // mysql null != null, which means that there can be many null values in a unique column, so null never
    // uniquely identifies a record
    const is_nill = value === undefined || value === null
    // $write $guid cannot be used as an identifying column, since when the record is executed, the guid will not be
    // in scope. It will only be fetched after the operation is done. for read guids however, the guid is in scope
    // (it must be in order to be read from), so we can use it to identify the record.
    const is_write_guid = value?.$guid !== undefined && value?.$write === true

    return !is_nill && !is_write_guid
}

export const get_possible_identifying_keys = (
    orma_schema: OrmaSchema,
    table_name: string
) => {
    const primary_keys = get_primary_keys(table_name, orma_schema)
    // we actually include nullable unique columns as potential keys, since they can be used as long as the
    // actual value submitted by the user is not null
    const unique_column_groups = get_unique_column_groups(
        table_name,
        false,
        orma_schema
    )

    return [
        primary_keys,
        // filter out primary keys so we dont get duplicate columns (since primary keys are also unique)
        ...unique_column_groups.filter(el => !array_set_equals(primary_keys, el))
    ]
}

export type InferIdentifyingColumnsInput = {
    record: Record<string, any>
    path: Path
}[]
