import { array_equals, get_difference } from '../helpers/helpers'
import { get_all_edges } from '../helpers/schema_helpers'
import {
    get_mutation_batches,
    MutationPiece,
} from '../mutate/plan/mutation_batches'
import {
    ConstraintDefinition,
    FieldDefinition,
    IndexDefinition,
    RegularCreateStatement,
} from '../types/schema/schema_ast_types'
import { OrmaSchema } from '../types/schema/schema_types'

export const get_schema_diff = (
    original_schema: OrmaSchema,
    final_schema: OrmaSchema
) => {
    const original_entities = Object.keys(original_schema.$entities)
    const final_entities = Object.keys(final_schema.$entities)

    const entities_to_create = get_difference(final_entities, original_entities)
    const create_entity_statements = entities_to_create.map(entity =>
        get_create_entity_statements(entity, final_schema.$entities[entity])
    )

    const sorted_create_statements = get_sorted_create_table_statements(
        final_schema,
        create_entity_statements
    )

    const sqlite_create_index_statements = entities_to_create.flatMap(entity =>
        get_create_index_statements_for_sqlite(
            entity,
            final_schema.$entities[entity]
        )
    )

    return [...sorted_create_statements, ...sqlite_create_index_statements]
}

const get_create_entity_statements = (
    entity_name: string,
    entity_schema: OrmaSchema['$entities'][string]
) => {
    const database_type = entity_schema.$database_type

    const fields: FieldDefinition[] =
        Object.keys(entity_schema.$fields).map(field_name => {
            const field_schema = entity_schema.$fields[field_name]
            // For sqlite to do auto incrementing, we need the magic INTEGER PRIMARY KEY
            // type. Having UNSIGNED or a precision like INTEGER(10) will cause it to 
            // not auto increment.
            if (database_type === 'sqlite' && field_schema.$auto_increment) {
                return {
                    $name: field_name,
                    $data_type: 'int',
                    $auto_increment: true
                }
            } else {
                return {
                    $name: field_name,
                    ...field_schema,
                }
            }
        }) ?? []

    const primary_key: ConstraintDefinition = {
        $constraint: 'primary_key',
        ...entity_schema.$primary_key,
    }

    const unique_keys: ConstraintDefinition[] =
        entity_schema?.$unique_keys?.map(el => ({
            $constraint: 'unique_key',
            ...el,
        })) ?? []

    const foreign_keys: ConstraintDefinition[] =
        entity_schema?.$foreign_keys?.map(el => ({
            $constraint: 'foreign_key',
            ...el,
        })) ?? []

    const indexes: IndexDefinition[] =
        entity_schema?.$indexes?.map(el => ({
            ...(el.$index ? { $index: el.$index } : { $index: true }),
            ...el,
        })) ?? []

    return {
        $create_table: entity_name,
        $comment: entity_schema.$comment,
        $definitions: [
            ...fields,
            ...unique_keys,
            ...foreign_keys,
            // primary key and indexes are special cases in sqlite that are handled separately
            ...(database_type !== 'sqlite' ? [primary_key, ...indexes] : []),
        ],
    }
}

/**
 * Unlike literally everything else like table options, fields, constraints, foreign keys etc,
 * SQLite insists that indexes are created using a completely separate CREATE INDEX syntax.
 * So this needs to be done separately to cover for SQLite's poor design choices.
 */
const get_create_index_statements_for_sqlite = (
    entity_name: string,
    entity_schema: OrmaSchema['$entities'][string]
) => {
    if (entity_schema.$database_type !== 'sqlite') {
        // indexes handled in the create statement for non-sqlite
        return []
    }

    const indexes: IndexDefinition[] =
        entity_schema?.$indexes?.map(el => ({
            ...(el.$index ? { $index: el.$index } : { $index: true }),
            ...el,
        })) ?? []

    return indexes.map(index => ({
        $create_index: index.$name,
        $on: {
            $entity: entity_name,
            $fields: index.$fields,
        },
    }))
}

const get_sorted_create_table_statements = (
    final_schema: OrmaSchema,
    create_statements: RegularCreateStatement[]
) => {
    // we make a fake mutation, which allows us to use the mutation planner to order our statements.
    const mutation_pieces: MutationPiece[] = create_statements.map(
        (statement, i) => {
            const entity = statement.$create_table
            // remove self-referencing foreign keys, since they dont affect insertion order
            // and would make this more complicated if included
            const edges = get_all_edges(entity, final_schema).filter(
                el => el.from_entity !== el.to_entity
            )

            // we set all foreign key and primary keys to the value 1, since this will result in the strongest
            // ordering when passed to the mutation planner
            const edge_fields_obj = edges.reduce((acc, edge) => {
                acc[edge.from_field] = 1
                return acc
            }, {} as Record<string, any>)

            return {
                path: [entity, 0],
                record: {
                    $operation: 'create',
                    // keep track of the statement to convert the sorted mutation pieces back to statements
                    $_statement_index: i,
                    ...edge_fields_obj,
                },
            }
        }
    )

    const mutation_plan = get_mutation_batches(final_schema, mutation_pieces)
    const sorted_statements = mutation_plan.mutation_pieces.map(
        ({ record }) => create_statements[record.$_statement_index]
    )

    return sorted_statements
}
