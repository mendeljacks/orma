import { get_higher_path } from '../mutate/helpers/mutate_helpers'
import { Path } from '../types'
import { array_equals, last } from './helpers'

export const nester = (
    data: NesterData,
    edges: NesterEdges,
    nester_modifications: NesterModification[]
) => {
    // indexes are used to quickly get references to records deep in the result json. Using an index
    // allows accessing these records directly, which is faster than using deep_get or deep_set.
    const indexes = initialize_indexes(data, edges)
    const result = get_results(data, edges, indexes, nester_modifications)
    return result
}

const initialize_indexes = (data: NesterData, edges: NesterEdges) => {
    const indexes = data.map(_ => ({} as IndexesByColumn))

    // initialze indexes with the columns that need to be indexed by
    edges.forEach((edge, i) => {
        if (edge === null) {
            // records on the root arent nested by any foreign key, so we dont have to make any index
            return
        }

        const [path_template] = data[i]
        const higher_datum_index = get_higher_datum_index(data, path_template)

        const index_column = edge[0]
        if (!indexes[higher_datum_index][index_column]) {
            indexes[higher_datum_index][index_column] = {}
        }
    })

    return indexes
}

const get_higher_datum_index = (data: NesterData, path_template: Path) => {
    const higher_path_template = get_higher_path(path_template)
    const data_index = data.findIndex(([check_path_template]) => {
        return array_equals(check_path_template, higher_path_template)
    })

    return data_index
}

/**
 * Adds and deletes according to the nester modifications. Mutates input records
 */
const apply_nester_modifications = (
    nester_modification: NesterModification | undefined,
    record: Record<string, any>
) => {
    if (!nester_modification) {
        return
    }

    nester_modification.additions.forEach(({ column, value }) => {
        record[column] = value
    })
    nester_modification.deletions.forEach(({ column }) => {
        delete record[column]
    })
}

const get_results = (
    data: NesterData,
    edges: NesterEdges,
    indexes: IndexesByColumn[],
    nester_modifications: NesterModification[]
) => {
    let result: Record<string, any> = {}
    data.forEach(([path_template, records], datum_index) => {
        const index = indexes[datum_index]
        const nester_modification = nester_modifications[datum_index]

        const array_mode = last(path_template) === 0
        const edge = edges[datum_index]
        const set_column = (
            array_mode
                ? path_template[path_template.length - 2]
                : last(path_template)
        ) as string

        // handle nesting on to the root of the results
        if (edge === null) {
            const root_value = array_mode ? records : records?.[0]
            if (root_value !== undefined) {
                result[set_column] = root_value
            }

            // add this record to the index so we can nest other stuff on it
            records?.forEach(record => {
                add_to_index(index, record)
                apply_nester_modifications(nester_modification, record)
            })

            return
        }

        // handle nesting on to some nested record in the result
        const [higher_column, column] = edge

        const higher_datum_index = get_higher_datum_index(data, path_template)
        const higher_index = indexes[higher_datum_index]
        records?.forEach(record => {
            // for each record we want to nest, find all the higher records, i.e. those records that
            // we should nest this record on to, then nest on to each higher record. Higher records are found
            // using the index we created previously
            const value = record[column]
            const higher_records = higher_index[higher_column][value]
            higher_records.forEach((higher_record, i) => {
                // shallow copy if there are other places we are nesting this, so that two places in the
                // result are not referencing the same object which can cause strance bugs where
                // a change in one place changes both places
                let record_to_nest =
                    i === higher_records.length - 1 ? record : { ...record }

                // add this record to the index so we can nest other stuff on it. We must do this once per higher record,
                // since we are making shallow copies for each higher record
                add_to_index(index, record_to_nest)
                nester_set(higher_record, record_to_nest, set_column, array_mode)
                apply_nester_modifications(nester_modification, record_to_nest)
            })
        })
    })

    return result
}

const nester_set = (obj: any, item: any, column: string, use_array: boolean) => {
    if (use_array) {
        if (!obj[column]) {
            obj[column] = []
        }
        obj[column].push(item)
    } else {
        obj[column] = item
    }
}

const add_to_index = (index: IndexesByColumn, record: Record<string, any>) => {
    // add the new record to the relevant index
    Object.keys(index).forEach(index_column => {
        const index_value = record[index_column]
        if (!index[index_column][index_value]) {
            index[index_column][index_value] = []
        }
        index[index_column][index_value].push(record)
    })
}

type IndexesByColumn = {
    [index_column: string]: {
        [column_value in any]: Record<string, any>[]
    }
}

export type NesterData = [Path, Record<string, any>[] | undefined][]
export type NesterEdges = (null | string[])[]
export type NesterModification = {
    additions: NesterAddition[]
    deletions: NesterDeletion[]
}
export type NesterDeletion = { column: string }
export type NesterAddition = { column: string; value: any }
