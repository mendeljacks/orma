import { OrmaError } from '../../helpers/error_handling'
import { orma_escape } from '../../helpers/escape'
import { deep_get, drop_last, is_simple_object } from '../../helpers/helpers'
import {
    get_direct_edge,
    is_parent_entity,
    is_reserved_keyword,
} from '../../helpers/schema_helpers'
import { path_to_string, string_to_path } from '../../helpers/string_to_path'
import { OrmaSchema as OrmaSchema } from '../../introspector/introspector'
import { combine_wheres } from '../../query/query_helpers'
import {
    generate_record_where_clause,
    get_identifying_keys,
    path_to_entity,
} from '../mutate'
import { GuidByPath, PathsByGuid } from './guid_macro'

export const get_update_asts = (
    entity_name: string,
    paths: (string | number)[][],
    mutation,
    orma_schema: OrmaSchema
) => {
    if (paths.length === 0) {
        return []
    }

    const update_asts = paths.map(path => {
        const record = deep_get(path, mutation)
        const identifying_keys = get_identifying_keys(
            entity_name,
            record,
            orma_schema
        )

        throw_identifying_key_errors('update', identifying_keys, path, mutation)

        const where = generate_record_where_clause(identifying_keys, record)

        const keys_to_set = Object.keys(record)
            .filter(key => !identifying_keys.includes(key))
            .filter(
                key =>
                    !is_simple_object(record[key]) &&
                    !Array.isArray(record[key])
            )
            .filter(key => !is_reserved_keyword(key))

        return {
            $update: entity_name,
            $set: keys_to_set.map(key => [key, orma_escape(record[key])]),
            $where: where,
        }
    })

    return update_asts
}

export const get_delete_ast = (
    entity_name: string,
    paths: (string | number)[][],
    mutation,
    orma_schema: OrmaSchema
) => {
    if (paths.length === 0) {
        return []
    }

    const wheres = paths.map(path => {
        const record = deep_get(path, mutation)
        const identifying_keys = get_identifying_keys(
            entity_name,
            record,
            orma_schema
        )

        throw_identifying_key_errors('delete', identifying_keys, path, mutation)

        const where = generate_record_where_clause(identifying_keys, record)

        return where
    })

    const $where = combine_wheres(wheres, '$or')

    const ast = {
        $delete_from: entity_name,
        $where,
    }

    return ast
}

export const get_create_ast = (
    entity_name: string,
    paths: (string | number)[][],
    mutation,
    db_row_by_path,
    orma_schema: OrmaSchema,
    guid_by_path: GuidByPath,
    paths_by_guid: PathsByGuid
) => {
    if (paths.length === 0) {
        return []
    }

    const records = paths.map(path => {
        const raw_record = deep_get(path, mutation, undefined)
        const foreign_key_obj = get_foreign_keys_obj(
            mutation,
            path,
            db_row_by_path,
            orma_schema
        )
        const guid_obj = get_guid_obj(
            mutation,
            path,
            db_row_by_path,
            orma_schema,
            guid_by_path,
            paths_by_guid
        )
        return {
            ...raw_record,
            ...foreign_key_obj,
            ...guid_obj,
        }
    })

    // get insert keys by combining the keys from all records
    const insert_keys = paths.reduce((acc, path, i) => {
        const record = records[i]

        // filter lower tables and keywords such as $operation from the sql
        const keys_to_insert = Object.keys(record)
            .filter(
                key =>
                    !is_simple_object(record[key]) &&
                    !Array.isArray(record[key])
            )
            .filter(key => !is_reserved_keyword(key))

        keys_to_insert.forEach(key => acc.add(key))

        return acc
    }, new Set() as Set<string>)

    const values = paths.map((path, i) => {
        const record = records[i]
        const record_values = [...insert_keys].map(key => record[key] ?? null)
        const escaped_record_values = record_values.map(value =>
            orma_escape(value)
        )
        return escaped_record_values
    })

    const ast = {
        $insert_into: [entity_name, [...insert_keys]],
        $values: values,
    }

    return ast
}

export const throw_identifying_key_errors = (
    operation: string,
    identifying_keys: string[],
    path: (string | number)[],
    mutation
) => {
    if (!identifying_keys || identifying_keys.length === 0) {
        throw {
            message: `Could not find primary keys or unique keys in record to ${operation}`,
            path: path,
            original_data: mutation,
            // stack_trace: new Error().stack,
            additional_info: {
                identifying_columns: identifying_keys ?? 'none',
            },
        } as OrmaError
    }
}

/**
 * Gets all the foreign key edges for a specific location in a mutation. Returned edges will be all edges from
 * the given location to a connected location in the mutation that are from child -> parent.
 */
export const get_foreign_keys_in_mutation = (
    mutation,
    record_path: (string | number)[],
    orma_schema: OrmaSchema
) => {
    const entity_name = path_to_entity(record_path)
    const record = deep_get(record_path, mutation)

    // get a list of the above path, as well as any below paths.
    // Some of these might by parents and some might be children.
    const above_path = drop_last(2, record_path)
    const below_paths = Object.keys(record)
        .filter(key => Array.isArray(record[key]))
        .map(key => [...record_path, key, 0])
    const all_paths = [above_path, ...below_paths]

    const foreign_keys = all_paths.flatMap(parent_path => {
        const parent_entity_name = parent_path?.[parent_path.length - 2]
        // dont do anything for the child paths (foreign keys only come from parents by definition)
        if (!is_parent_entity(parent_entity_name, entity_name, orma_schema)) {
            return []
        }

        // assuming the thing is a parent, we need exactly one edge from the current entity to the parent
        // (since the syntax has no way to specify which foreign key to use in that case).
        // This function throws an error if there is not exactly one edge
        const edge = get_direct_edge(
            entity_name,
            parent_entity_name,
            orma_schema
        )

        return [
            {
                parent_path,
                edge,
            },
        ]
    })

    return foreign_keys
}

/**
 * Gets an object containing all the foreign keys of the record at the given location.
 * Foreign keys are taken from the results_by_path object
 */
export const get_foreign_keys_obj = (
    mutation,
    record_path: (string | number)[],
    results_by_path,
    orma_schema: OrmaSchema
): Record<string, unknown> => {
    const foreing_keys = get_foreign_keys_in_mutation(
        mutation,
        record_path,
        orma_schema
    )

    // now we will get foreign keys for all the paths that are parent paths (ignoring child paths) and
    // put the foreign keys in an object of { [foreign_key_name]: foreign_key_value}
    // this object is in the right format to spread into the current record
    const foreign_key_obj = foreing_keys.reduce(
        (obj, { parent_path, edge }) => {
            // we take the combined parent record as it is in the original mutation (this might have some of the foreign keys)
            // and also the same parent record from the previous results (e.g. autogenerated primiary keys from the database).
            // The combination of these will contain all the possible foreign key values from this specific parent.
            const parent_record = deep_get(parent_path, mutation)
            const previous_result = results_by_path[path_to_string(parent_path)]

            // set the foreign key from whatever data is present. Note that we dont use ?? since a null value in the
            // previous_result object should still be used, only if the prop is not present should we look in the
            // parent record of the mutation
            obj[edge.from_field] =
                previous_result[edge.to_field] === undefined
                    ? parent_record[edge.to_field]
                    : previous_result[edge.to_field]
            return obj
        },
        {}
    )

    return foreign_key_obj
}

/**
 * Gets an object containing all the guid values which resolved
 * looking at the guid_by_path and the paths this partial guid obj can be built
 * Example output { inventory_adjustment_id: 11 } for something which used to be { inventory_adjustment_id: { $guid: 'my_guid'}}
 */
export const get_guid_obj = (
    mutation,
    path: (string | number)[],
    db_row_by_path,
    orma_schema: OrmaSchema,
    guid_by_path: GuidByPath,
    paths_by_guid: PathsByGuid
): Record<string, unknown> => {
    const path_string = path_to_string(path)
    const { guid, column_name } = guid_by_path[path_string] || {}
    if (!guid) return {}

    let path_strings = paths_by_guid[guid]
    let resolved = path_strings.reduce((acc, path_string, i) => {
        const { column_name: other_column_name } =
            guid_by_path[path_string] || {}
        const resolved_value = db_row_by_path[path_string]?.[other_column_name]
        if (resolved_value && !acc[column_name]) {
            acc[column_name] = resolved_value
        }
        return acc
    }, {})
    return resolved
}
