import { get_difference } from '../helpers/helpers'
import { lir_join } from '../helpers/lir_join'
import { get_all_edges } from '../helpers/schema_helpers'
import {
    get_mutation_batches,
    MutationPiece,
} from '../mutate/plan/mutation_batches'
import {
    AlterStatement,
    ConstraintDefinition,
    Definition,
    FieldDefinition,
    IndexDefinition,
    RegularCreateStatement,
} from '../types/schema/schema_ast_types'
import { OrmaSchema } from '../types/schema/schema_types'

export const get_schema_diff = (
    old_schema: OrmaSchema,
    new_schema: OrmaSchema
) => {
    const old_entities = Object.keys(old_schema.$entities)
    const new_entities = Object.keys(new_schema.$entities)

    const {
        left: removed_entities,
        inner: updated_entities,
        right: added_entities,
    } = lir_join(
        old_entities,
        [] as string[],
        new_entities,
        el => el,
        (l, i, r) => [...i, ...l],
        el => el
    )

    const create_entity_statements = added_entities.map(entity =>
        get_create_entity_statements(entity, new_schema.$entities[entity])
    )

    const add_definition_statements = updated_entities.flatMap(entity =>
        get_field_statements(
            entity,
            old_schema.$entities[entity],
            new_schema.$entities[entity]
        )
    )

    const sorted_create_statements = get_sorted_create_table_statements(
        new_schema,
        [...create_entity_statements, ...add_definition_statements]
    )

    return sorted_create_statements
}

const get_field_statements = (
    entity: string,
    old_schema: OrmaSchema['$entities'][string],
    new_schema: OrmaSchema['$entities'][string]
) => {
    const old_definitions = get_definitions(entity, old_schema)
    const new_definitions = get_definitions(entity, new_schema)

    const {
        left: removed_definitions,
        inner: updated_definitions,
        right: added_definitions,
    } = lir_join(
        old_definitions,
        [] as { old_definition: Definition; new_definition: Definition }[],
        new_definitions,
        get_definition_identifier,
        (old_definition, i, new_definition) => [
            ...i,
            {
                old_definition: old_definition[0],
                new_definition: new_definition[0],
            },
        ],
        get_definition_identifier
    )

    const added_statements: AlterStatement[] = added_definitions.map(def => ({
        $alter_table: entity,
        $definitions: [
            {
                $alter_operation: 'add',
                ...def,
            },
        ],
    }))

    return added_statements

    // TODO: handle update and deleted fields - write tests first
}

/**
 * Get a unique identifier for a definition within an entity, either using the given $name,
 * or using the fields if no name is given
 */
const get_definition_identifier = (definition: Definition) => {
    let identifier: string | readonly string[]
    if (definition.$data_type) {
        identifier = definition.$name
    } else if (definition.$index || definition.$constraint) {
        identifier = definition.$name ?? definition.$fields
    } else throw new Error('Unknown definition type')

    return JSON.stringify(identifier)
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

const get_definitions = (
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

    return [...fields, primary_key, ...unique_keys, ...foreign_keys, ...indexes]
}

const get_add_field_statement = (
    entity_name: string,
    field_name: string,
    field_schema: OrmaSchema['$entities'][string]['$fields'][string]
) => {
    const statement: AlterStatement = {
        $alter_table: entity_name,
        $definitions: [
            {
                $alter_operation: 'add',
                $name: field_name,
                ...field_schema,
            },
        ],
    }

    return statement
}

const get_add_constraint_statement = (
    entity_name: string,
    entity_schema: OrmaSchema['$entities'][string]
) => {
    const statement: AlterStatement = {
        $alter_table: entity_name,
        $definitions: [
            {
                $alter_operation: 'add',
                $constraint: 'primary_key',
                ...entity_schema.$primary_key,
            },
        ],
    }
}

const get_sorted_create_table_statements = (
    new_schema: OrmaSchema,
    create_statements: (RegularCreateStatement | AlterStatement)[]
) => {
    // we make a fake mutation, which allows us to use the mutation planner to order our statements.
    const mutation_pieces: MutationPiece[] = create_statements.map(
        (statement, i) => {
            const entity =
                '$create_table' in statement
                    ? statement.$create_table
                    : statement.$alter_table
            const edges = get_all_edges(entity, new_schema)

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

    const mutation_plan = get_mutation_batches(new_schema, mutation_pieces)
    const sorted_statements = mutation_plan.mutation_pieces.map(
        ({ record }) => create_statements[record.$_statement_index]
    )

    return sorted_statements
}
