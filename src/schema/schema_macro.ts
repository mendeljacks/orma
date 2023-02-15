import { get_difference } from '../helpers/helpers'
import { get_all_edges } from '../helpers/schema_helpers'
import { get_mutation_plan } from '../mutate/plan/mutation_plan'
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

    return sorted_create_statements
}

const get_create_entity_statements = (
    entity_name: string,
    entity_schema: OrmaSchema['$entities'][string]
) => {
    const fields: FieldDefinition[] =
        Object.keys(entity_schema.$fields).map(field_name => ({
            $name: field_name,
            ...entity_schema.$fields[field_name],
        })) ?? []

    const primary_key: ConstraintDefinition = {
        $constraint: 'primary_key',
        ...entity_schema.$primary_key,
    }

    const indexes: IndexDefinition[] =
        entity_schema?.$indexes?.map(el => ({
            ...(el.$index ? { $index: el.$index } : { $index: true }),
            ...el,
        })) ?? []

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

    return {
        $create_table: entity_name,
        $comment: entity_schema.$comment,
        $definitions: [
            ...fields,
            primary_key,
            ...unique_keys,
            ...foreign_keys,
            ...indexes,
        ],
    }
}

const get_sorted_create_table_statements = (
    final_schema: OrmaSchema,
    create_statements: RegularCreateStatement[]
) => {
    // we make a fake mutation, which allows us to use the mutation planner to order our statements.
    const mutation = create_statements.reduce((acc, statement, i) => {
        const entity = statement.$create_table
        const edges = get_all_edges(entity, final_schema)

        // we set all foreign key and primary keys to the value 1, since this will result in the strongest
        // ordering when passed to the mutation planner
        const edge_fields_obj = edges.reduce((acc, edge) => {
            acc[edge.from_field] = 1
            // keep track of the statement to convert the sorted mutation pieces back to statements
            acc.$_statement_index = i
            return acc
        }, {} as Record<string, any>)

        acc[entity] = [
            {
                $operation: 'create',
                ...edge_fields_obj,
            },
        ]
        return acc
    }, {} as Record<string, any>)

    const mutation_plan = get_mutation_plan(mutation, final_schema)
    const sorted_statements = mutation_plan.mutation_pieces.map(
        ({ record }) => create_statements[record.$_statement_index]
    )

    return sorted_statements
}
