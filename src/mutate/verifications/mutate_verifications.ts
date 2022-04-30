// import { orma_schema } from '../introspector/introspector'

// export const verify_foreign_keys = async (mutation, mutation_path,  orma_schema: orma_schema) => {
//     // this should probably be split into data collection (returns sql string) and checking (returns errors)
// }

export const verify_independence = async (
    mutation,
    orma_query: (query) => Promise<any>
) => {
    // this ensures no two records in the mutation refer to the same database row, since it introduces
    // undefined behaviours (since updates or an update and a delete can run in parallel). Also it could break
    // if a unique key is edited and then the old unique key value is used to try to edit something
}

// TODO: write a test for uniqueness showing that '1' !== 1

const a = {
    $where: {
        $or: [
            {
                $in: ['sku', ['a', 'b']],
            },
            {
                $and: [
                    {
                        $eq: ['variant_id', 12],
                    },
                    {
                        $eq: ['category_id', 13],
                    },
                ],
            },
        ],
    },
}

// /**
//  * Updates and deletes need identifying keys to find which record to update/delete. In practice this is the primary key(s)
//  * or a unique key. This verification checks whether these identifying keys exist in the database
//  */
// export const get_verify_identifiers_sql = (operation: operation, mutation_records: Record<string, unknown>[], orma_schema: orma_schema) => {
//     /*
//     This will not catch something like [{
//         $operation: 'update',
//         id: 1,
//         unique_key: 'something_else'
//     }, {
//         $operation: 'update',
//         unique_key: 'test'
//     }]

//     if they are actually the same object, i.e. {
//         id: 1,
//         unique_key: 'test'
//     }

//     In this case, the verification will pass (we dont know that the two mutations are actually affecting the
//     same record), but we will get a SQL error (the first update changes the unique_key so when the second one
//     runs, there is no record with unique_key of 'test').

//     to get around this, we can first find all the primary keys for records, then compare them. If we find the same
//     primary key(s) more than once, or some record doesnt have a primary key, we can throw an error. Also
//     we need to ensure we are looking at all records for a given entity, even if that entity is in multiple nesting
//     locations of the mutation.

//     Algorithm:

//     */

//     const errors = []

// }

// export const get_verify_foreign_key_editing_sql = () => {
//     /*

//     Whenever we update or delete, we need to verify that we are not breaking a foreign key connection.
//     For updating, this is only relevant if we update a foreign key. For delete we need to find all its foreign
//     key children and make sure we are not deleting if it has any. Unless that child is already being deleted.

//     */
// }

// export const get_verify_foreign_key_sql = () => {
//     /*

//     In a case like {
//         parents: {
//             $operation: 'update',
//             $id: 123,
//             $where: {
//                 $eq: ['unique_key', 5]
//             }
//         },

//         children:{
//             $operation: 'create',
//             parent_id: 1
//         }
//     }

//     If we originally had
//     parents = [{
//         id: 1,
//         unique_key: 5
//     }]

//     Similar situation if the update was actually a delete

//     we would have an issue if the update ran first. To catch this, we could pull in all the parent records,
//     do a search to make sure they all have their foreign keys (only for the ones that dont already), then
//     if we see we are modifying a record that we are trying to link to we can throw an error

//     */
// }

// export const verify_identifying_keys_exist_OLD = async (connection, body, nest_paths, table_infos) => {
//     const checkpoint_count = nest_paths.length
//     const sql_checkpoint = make_sql_checkpoint(connection, checkpoint_count)

//     const errors = []
//     await Promise.all(nest_paths.map(async nest_path => {
//         const table_name = get_table_name(nest_path)
//         const subpaths = get_subpaths(nest_path, body).filter(subpath => {
//             const operation = path(subpath, body)?.meta?.operation
//             return includes(operation, ['update', 'delete'])
//         })

//         if (subpaths.length === 0) {
//             return await sql_checkpoint(undefined)
//         }

//         const supplied_rows = get_supplied_rows(body, subpaths)

//         const primary_key = get_primary_key_name(table_name, table_infos)
//         const supplied_primary_keys = pluck(primary_key, supplied_rows)

//         const query = `
//             SELECT ${table_name}.${primary_key} FROM ${table_name}
//             WHERE ${table_name}.${primary_key} IN (${supplied_primary_keys.map(p_key => escape(p_key))})
//         `

//         const db_rows = await sql_checkpoint(query)

//         for (const i of range(0, supplied_rows.length)) {
//             const supplied_row = supplied_rows[i]
//             const subpath = subpaths[i]

//             const db_values = pluck(primary_key, db_rows)
//             const value = supplied_row[primary_key]
//             const primary_key_is_missing = !includes(value, db_values)
//             if (primary_key_is_missing) {
//                 errors.push({
//                     message: `${primary_key} ${value} does not exist in ${table_name}.`,
//                     path: append(primary_key, subpath),
//                     invalid_data: value,
//                     recommendation: `Please modify the update key so that it references an existing ${primary_key}.`
//                 })
//             }
//         }
//     }))

//     if (errors.length > 0) {
//         return Promise.reject(generate_error_response('missing_reference', errors))
//     }
// }

// do not allow product_id 5 if nested
