import { extract_subpaths } from "./extract_subpaths";
import { deep_get, deep_set, drop_last, last } from "./helpers";
import { lir_join } from "./lir_join";
import { push_path } from "./push_path";

/**
 * @param data Takes a list of nest path and nest data pairs ordered by acceptable insert order
 * @param edges Takes a list of edges corresponding to the points between the data
 */
export const nester = (data, edges) => {
    // Requires that data is sorted so that later elements are equal or deeper in json tree
    let result = {}
    for (let i = 0; i < data.length; i++) {
        const [path, list]: any = data[i];
        if (i === 0) deep_set(path, list, result)
        else {
            const left_list = extract_subpaths(drop_last(path), result)
            const { left, inner, right } = lir_join(
                left_list,
                result,
                list,
                (el) => deep_get([...el, edges[i - 1].from_field], result),
                (l, i, r) => {
                    // for each image, mutate inner
                    // placing the element at correct subpath with images appended to path
                    r.forEach(right_adjacent => push_path(
                        [...l[0], last(path)],
                        right_adjacent,
                        i
                    ))
                    return i
                },
                el => el[edges[i - 1].to_field]
            )
        }



    }
    return result
}