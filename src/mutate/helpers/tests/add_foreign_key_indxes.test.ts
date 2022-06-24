// import { describe, test } from 'mocha'
// import { expect } from 'chai'
// import { add_foreign_key_indexes } from '../../database_results/sort_database_rows'
// import { orma_test_schema } from '../../mutate.test'

// import { apply_guid_macro } from '../../macros/guid_macro'
// import { clone } from '../../../helpers/helpers'
// import { OrmaSchema } from '../../../introspector/introspector'

// const test_statements = [
//     {
//         paths: [
//             ['parents', 0],
//             ['parents', 1],
//         ],
//         route: ['parents'],
//     },
// ]

// describe('Foreign Key Propagation', () => {
//     describe(add_foreign_key_indexes.name, () => {
//         test('works with multiple identifying keys', () => {
//             const query_results = [
//                 [
//                     {
//                         // unique key
//                         unique1: 1,
//                         grandparent_id: 11,
//                     },
//                     {
//                         // simple primary key
//                         id: 3,
//                         grandparent_id: 13,
//                     },
//                 ],
//             ]

//             // note that the order of the mutation is not the same as the query results order (this is to make
//             // sure the function is being tested properly)
//             const mutation = {
//                 parents: [{ id: 3 }, { unique1: 1 }],
//             }

//             const result = add_foreign_key_indexes(
//                 test_statements,
//                 query_results,
//                 mutation,
//                 orma_test_schema
//             )

//             expect(result).to.deep.equal({
//                 '["parents",0]': {
//                     id: 3,
//                     grandparent_id: 13,
//                 },
//                 '["parents",1]': {
//                     unique1: 1,
//                     grandparent_id: 11,
//                 },
//             })
//         })
//         test('works with multiple statements', () => {
//             const statements = [
//                 {
//                     paths: [['parents', 0]],
//                     route: ['parents'],
//                 },
//                 {
//                     paths: [['parents', 0, 'children', 0]],
//                     route: ['parents', 'children'],
//                 },
//             ]

//             const query_results = [
//                 [
//                     {
//                         id: 1,
//                         grandparent_id: 11,
//                     },
//                 ],
//                 [{ id1: 1, id2: 2, parent_id: 12 }],
//             ]

//             const mutation = {
//                 parents: [
//                     {
//                         id: 1,
//                         children: [
//                             {
//                                 // composite primary key
//                                 id1: 1,
//                                 id2: 2,
//                             },
//                         ],
//                     },
//                 ],
//             }

//             const result = add_foreign_key_indexes(
//                 statements,
//                 query_results,
//                 mutation,
//                 orma_test_schema
//             )

//             expect(result).to.deep.equal({
//                 '["parents",0]': {
//                     id: 1,
//                     grandparent_id: 11,
//                 },
//                 '["parents",0,"children",0]': { id1: 1, id2: 2, parent_id: 12 },
//             })
//         })
//         test('works with duplicate keys', () => {
//             // this situation could happen e.g. if there are rows in different locations in the mutation

//             const query_results = [
//                 [
//                     {
//                         id: 1,
//                         grandparent_id: 11,
//                     },
//                 ],
//             ]

//             const mutation = {
//                 parents: [
//                     { id: 1 },
//                     {
//                         id: 1,
//                     },
//                 ],
//             }

//             const result = add_foreign_key_indexes(
//                 test_statements,
//                 query_results,
//                 mutation,
//                 orma_test_schema
//             )

//             // it should add foreign keys to both locations, even though they have the same id and there is only
//             // on record returned from the database
//             expect(result).to.deep.equal({
//                 '["parents",0]': {
//                     id: 1,
//                     grandparent_id: 11,
//                 },
//                 '["parents",1]': {
//                     id: 1,
//                     grandparent_id: 11,
//                 },
//             })
//         })
//     })
// })
