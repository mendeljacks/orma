import {
    get_primary_keys,
    get_unique_field_groups,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'

export const get_possible_identifying_keys = (
    entity_name: string,
    orma_schema: OrmaSchema
) => {
    const primary_keys = get_primary_keys(entity_name, orma_schema)
    // we filter out nullable unique columns, since then there might be multiple records
    // all having null so that column wouldnt uniquely identify a record
    const unique_field_groups = get_unique_field_groups(
        entity_name,
        true,
        orma_schema
    )

    return [primary_keys, ...unique_field_groups]
}

export const get_identifying_keys = (
    entity_name: string,
    record: Record<string, any>,
    orma_schema: OrmaSchema,
    choose_first_unique_key: boolean = false
) => {
    const primary_keys = get_primary_keys(entity_name, orma_schema)
    const has_primary_keys = primary_keys.every(
        key => record[key] !== undefined
    )
    if (has_primary_keys && primary_keys.length > 0) {
        check_values_for_guids(record, primary_keys)
        return primary_keys
    }

    // we filter out nullable unique columns, since then there might be multiple records
    // all having null so that column wouldnt uniquely identify a record
    const unique_field_groups = get_unique_field_groups(
        entity_name,
        true,
        orma_schema
    )
    const included_unique_keys = unique_field_groups.filter(unique_fields =>
        unique_fields.every(key => record[key] !== undefined)
    )

    if (choose_first_unique_key) {
        return included_unique_keys[0]
    } else {
        if (included_unique_keys.length === 1) {
            check_values_for_guids(record, included_unique_keys[0])
            // if there are 2 or more unique keys, we cant use them since it would be ambiguous which we choose
            return included_unique_keys[0]
        }

        return []
    }
}

const check_values_for_guids = (record, keys) => {
    if (keys.some(key => record[key]?.$guid !== undefined)) {
        throw new Error(
            `Tried to use keys ${keys} but some value is a $guid. This has been disabled because it can cause confusing behaviour. Please set the value to a constant to fix this.`
        )
    }
}
