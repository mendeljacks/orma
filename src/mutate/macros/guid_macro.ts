import { deep_for_each, deep_get, drop_last, last } from '../../helpers/helpers'
import { path_to_string } from '../../helpers/string_to_path'

type Guid = string
export type GuidMap = Record<string, Guid>
export const apply_guid_macro = (mutation: any): { guid_map: GuidMap } => {
    // Keyed by path string and value is a $guid such as 5
    let guid_map: GuidMap = {}

    deep_for_each(mutation, (value, path) => {
        if (last(path) === '$guid') {
            // Remember where the guid was
            const path_string = path_to_string(path)
            const guid = deep_get(path, mutation, undefined)
            guid_map[path_string] = guid

            // Remove the $guid from the mutation
            const path_to_parent = drop_last(2, path)
            const parent = deep_get(path_to_parent, mutation, undefined)
            const column_name = last(drop_last(1, path))
            delete parent[column_name]
        }
    })

    return { guid_map }
}
