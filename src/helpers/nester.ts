import { extract_subpaths } from './extract_subpaths'
import { deep_get, deep_set, drop_last, last } from './helpers'
import { lir_join } from './lir_join'
import { push_path } from './push_path'

/**
 * @param data Takes a list of nest path and nest data pairs ordered by acceptable insert order
 * @param edges Takes a list of edges corresponding to the points between the data
 */
export const nester = (data, edges) => {
    // Requires that data is sorted so that later elements are equal or deeper in json tree
    let result = {}
    for (let i = 0; i < data.length; i++) {
        const [pth, list]: any = data[i]
        const array_mode = last(pth) === 0
        const path = array_mode ? drop_last(1, pth) : pth
        if (!edges[i]) deep_set(path, list, result)
        else {
            const left_list = extract_subpaths(drop_last(1, path), result)
            const { left, inner, right } = lir_join(
                left_list,
                result,
                list,
                el => deep_get([...el, edges[i][0]], result),
                (l, i, r) => {
                    r.forEach(right_adjacent => {
                        l.forEach(left_adjacent => {
                            if (array_mode) {
                                push_path(
                                    [...left_adjacent, last(path)],
                                    right_adjacent,
                                    i
                                )
                            } else {
                                deep_set(
                                    [...left_adjacent, last(path)],
                                    right_adjacent,
                                    i
                                )
                            }
                        })
                    })

                    return i
                },
                el => el[edges[i][1]]
            )
        }
    }
    return result
}
