/**
 * Performs left, inner and right join simultaniously.
 * Efficient way to nest data or compare lists of data.
 *
 * @param left_list The left list of elements
 * @param inner_list The default value for the inner prop of output
 * @param right_list The right list of elements
 * @param left_fn Provide a function mapping a left list element to a left value which will match a right value
 * @param inner_fn Provide a function mapping (left_adjacents, inner, right_adjacents) => inner
 * @param right_fn Provide a function mapping a right list element to a right value which will match a left value
 */
export const lir_join = <
    LeftList extends any[],
    InnerList extends any[],
    RightList extends any[]
>(
    left_list: LeftList,
    inner_list: InnerList,
    right_list: RightList,
    left_fn: (el: LeftList[number]) => any,
    inner_fn: (
        left_el: LeftList,
        inner_list: InnerList,
        right_el: RightList
    ) => InnerList,
    right_fn: (el: RightList[number]) => any
) => {
    let memory: any = {}

    for (let i = 0; i < left_list.length; i++) {
        const left_list_el = left_list[i]
        const left_list_val = left_fn(left_list_el)
        if (!memory[left_list_val])
            memory[left_list_val] = { left: [], right: [] }
        memory[left_list_val]['left'].push(left_list_el)
    }
    for (let i = 0; i < right_list.length; i++) {
        const right_list_el = right_list[i]
        const right_list_val = right_fn(right_list_el)
        if (!memory[right_list_val])
            memory[right_list_val] = { left: [], right: [] }
        memory[right_list_val]['right'].push(right_list_el)
    }

    let output = {
        left: [] as any[] as LeftList,
        inner: inner_list,
        right: [] as any[] as RightList,
    }
    const keys = Object.keys(memory)
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (memory[key].left.length > 0 && memory[key].right.length === 0) {
            output.left.push(...memory[key].left)
        }
        if (memory[key].left.length > 0 && memory[key].right.length > 0) {
            output.inner = inner_fn(
                memory[key].left,
                output.inner,
                memory[key].right
            )
        }
        if (memory[key].left.length === 0 && memory[key].right.length > 0) {
            output.right.push(...memory[key].right)
        }
    }

    return output
}
