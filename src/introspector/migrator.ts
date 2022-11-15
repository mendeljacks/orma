// import { lir_join } from '../helpers/lir_join'
// import { is_reserved_keyword } from '../helpers/schema_helpers'
// import {
//     orma_entity_schema,
//     orma_field_schema,
//     orma_index_schema,
//     OrmaSchema,
// } from './introspector'

// export const migrator = (
//     target_schema: OrmaSchema,
//     database_schema: OrmaSchema = {}
// ) => {
//     const target_entities = Object.keys(target_schema).filter(
//         key => !is_reserved_keyword(key)
//     )
//     const database_entities = Object.keys(database_schema).filter(
//         key => !is_reserved_keyword(key)
//     )

//     const {
//         left: target_only_entities,
//         inner: both_entities,
//         right: database_only_entities,
//     } = lir_join(
//         target_entities,
//         [],
//         database_entities,
//         el => el,
//         (l, i, r) => [...i, l],
//         el => el
//     )

//     both_entities.map(entity_name => {
//         const target_entity_schema = target_schema[entity_name]
//         const database_entity_schema = database_schema[entity_name]

//         const {
//             left: target_only_fields,
//             inner: both_entities,
//             right: database_only_entities,
//         } = lir_join(
//             target_entities,
//             [],
//             database_entities,
//             el => el,
//             (l, i, r) => [...i, l],
//             el => el
//         )
//     })
// }

// const field_schema_to_sql = (
//     field_name: string,
//     field_schema: orma_field_schema
// ) => {
//     const data_type_args = [
//         field_schema.character_count,
//         field_schema.decimal_places,
//     ]
//         .filter(el => el === undefined)
//         .join(', ')

//     return `${field_name} ${field_schema.data_type}(${data_type_args}) ${
//         field_schema.not_null ? 'NOT NULL' : 'NULL'
//     }${field_schema.primary_key ? ' PRIMARY KEY' : ''}${
//         field_schema.default ? ` DEFAULT ${field_schema.default}` : ''
//     }${field_schema.auto_increment ? ' AUTO INCREMENT' : ''}`
// }

// const generate_create_statement_sql = (
//     entity_name: string,
//     entity_schema: orma_entity_schema
// ) => {
//     return `CREATE TABLE ${entity_name} (${Object.keys(entity_schema)
//         .filter(key => !is_reserved_keyword(key))
//         .map(field_name =>
//             field_schema_to_sql(
//                 field_name,
//                 entity_schema[field_name] as orma_field_schema
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
//     } UNIQUE (${index_schema.fields.join(', ')})${
//         index_schema.invisible ? ' INVISIBLE' : ''
//     }`
// }
export {}