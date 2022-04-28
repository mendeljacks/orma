import { deep_for_each, deep_get, drop_last, last } from '../../helpers/helpers'
import { path_to_string } from '../../helpers/string_to_path'

type Guid = { guid: string; column_name: string }
// The path string only goes till the parent element and does not include column name
export type GuidMap = { [path_string: string]: Guid }
export const apply_guid_macro = (mutation: any): { guid_map: GuidMap } => {
    // Keyed by path string and value is a $guid such as 5
    let guid_map: GuidMap = {}

    deep_for_each(mutation, (value, path) => {
        if (last(path) === '$guid') {
            // Remember where the guid was
            const path_to_parent = drop_last(2, path)
            const path_string = path_to_string(path_to_parent)
            const guid = deep_get(path, mutation, undefined)
            const column_name = last(drop_last(1, path))
            guid_map[path_string] = { guid, column_name }

            // Remove the $guid from the mutation
            const parent = deep_get(path_to_parent, mutation, undefined)
            delete parent[column_name]
        }
    })

    return { guid_map }
}
