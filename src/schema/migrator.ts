// import { lir_join } from '../helpers/lir_join'
// import { is_reserved_keyword } from '../helpers/schema_helpers'
// import {
//     orma_table_schema,
//     orma_column_schema,
//     orma_index_schema,
//     OrmaSchema,
// } from './introspector'

// export const migrator = (
//     target_schema: OrmaSchema,
//     database_schema: OrmaSchema = {}
// ) => {
//     const target_tables = Object.keys(target_schema).filter(
//         key => !is_reserved_keyword(key)
//     )
//     const database_tables = Object.keys(database_schema).filter(
//         key => !is_reserved_keyword(key)
//     )

//     const {
//         left: target_only_tables,
//         inner: both_tables,
//         right: database_only_tables,
//     } = lir_join(
//         target_tables,
//         [],
//         database_tables,
//         el => el,
//         (l, i, r) => [...i, l],
//         el => el
//     )

//     both_tables.map(table_name => {
//         const target_table_schema = target_schema[table_name]
//         const database_table_schema = database_schema[table_name]

//         const {
//             left: target_only_columns,
//             inner: both_tables,
//             right: database_only_tables,
//         } = lir_join(
//             target_tables,
//             [],
//             database_tables,
//             el => el,
//             (l, i, r) => [...i, l],
//             el => el
//         )
//     })
// }

// const column_schema_to_sql = (
//     column_name: string,
//     column_schema: orma_column_schema
// ) => {
//     const data_type_args = [
//         column_schema.character_count,
//         column_schema.decimal_places,
//     ]
//         .filter(el => el === undefined)
//         .join(', ')

//     return `${column_name} ${column_schema.data_type}(${data_type_args}) ${
//         column_schema.not_null ? 'NOT NULL' : 'NULL'
//     }${column_schema.primary_key ? ' PRIMARY KEY' : ''}${
//         column_schema.default ? ` DEFAULT ${column_schema.default}` : ''
//     }${column_schema.auto_increment ? ' AUTO INCREMENT' : ''}`
// }

// const generate_create_statement_sql = (
//     table_name: string,
//     table_schema: orma_table_schema
// ) => {
//     return `CREATE TABLE ${table_name} (${Object.keys(table_schema)
//         .filter(key => !is_reserved_keyword(key))
//         .map(column_name =>
//             column_schema_to_sql(
//                 column_name,
//                 table_schema[column_name] as orma_column_schema
//             )
//         )
//         .join(',\n')})`
// }

// const index_schema_to_sql = (index_schema: orma_index_schema) => {
//     if (index_schema.is_unique !== true) {
//         throw new Error('Regular indexes not supported yet')
//     }

//     if (index_schema.index_type) {
//         throw new Error('Index type not supported')
//     }

//     return `${
//         index_schema.index_name ? `CONSTRAINT ${index_schema.index_name}` : ''
//     } UNIQUE (${index_schema.columns.join(', ')})${
//         index_schema.invisible ? ' INVISIBLE' : ''
//     }`
// }
export {}