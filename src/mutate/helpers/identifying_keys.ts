import { array_equals } from '../../helpers/helpers'
import {
    get_primary_keys,
    get_unique_field_groups,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { ValuesByGuid } from '../mutate'
import { get_resolved_mutation_value } from '../statement_generation/mutation_operations'

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

    return [
        primary_keys,
        // filter out primary keys so we dont get duplicate fields (since primary keys are also unique)
        ...unique_field_groups.filter(el => !array_equals(primary_keys, el)),
    ]
}

export const get_identifying_keys = (
    entity_name: string,
    record: Record<string, any>,
    values_by_guid: ValuesByGuid,
    orma_schema: OrmaSchema,
    allow_ambiguity: boolean = false
) => {
    const primary_keys = get_primary_keys(entity_name, orma_schema)
    const primary_key_values = primary_keys.map(key =>
        get_resolved_mutation_value(record, key, values_by_guid)
    )
    const has_primary_keys = primary_key_values.every(
        value => value !== undefined
    )
    if (has_primary_keys && primary_keys.length > 0) {
        const has_guid = check_values_for_guids(
            primary_key_values,
            !allow_ambiguity
        )
        if (!has_guid) {
            return primary_keys
        }
    }

    // we filter out nullable unique columns, since then there might be multiple records
    // all having null so that column wouldnt uniquely identify a record
    const unique_field_groups = get_unique_field_groups(
        entity_name,
        true,
        orma_schema
        // we dont want to use primary key even though they are unique,
        // since we already checked the primary key earlier
    ).filter(unique_fields => !array_equals(primary_keys, unique_fields))

    const unique_values = unique_field_groups.map(unique_fields =>
        unique_fields.map(field =>
            get_resolved_mutation_value(record, field, values_by_guid)
        )
    )
    const included_unique_keys = unique_field_groups.filter((field_group, i) =>
        unique_values[i].every(value => value !== undefined)
    )

    if (allow_ambiguity) {
        return included_unique_keys[0]
    } else {
        if (included_unique_keys.length === 1) {
            const has_guid = check_values_for_guids(
                unique_values[0],
                !allow_ambiguity
            )
            if (!has_guid) {
                // if there are 2 or more unique keys, we cant use them since it would be ambiguous which we choose
                return included_unique_keys[0]
            }
        }

        return []
    }
}

const check_values_for_guids = (values: any[], throw_error: boolean) => {
    const has_guid = values.some(value => value?.$guid !== undefined)
    if (has_guid && throw_error) {
        throw new Error(
            `Some value needed for identifying a record is a $guid. This has been disabled because it can cause confusing behaviour. Please set the value to a constant to fix this.`
        )
    }

    return has_guid
}
