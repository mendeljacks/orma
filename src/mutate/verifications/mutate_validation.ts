import { validate } from 'jsonschema'
import { OrmaError } from '../../helpers/error_handling'
import {
    get_all_edges,
    get_field_names,
    is_entity_name,
    is_field_name,
    is_parent_entity,
    is_required_field,
    is_reserved_keyword,
} from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../introspector/introspector'
import { get_foreign_keys_in_mutation } from '.././macros/operation_macros'
import { get_identifying_keys } from '../mutate'

export const mutate_validation_schema = {
    type: 'object',
    properties: {
        $operation: {
            type: 'string',
            enum: ['create', 'update', 'delete'],
        },
    },
    additionalProperties: {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                $operation: {
                    type: 'string',
                    enum: ['create', 'update', 'delete'],
                },
            },
            additionalProperties: {
                oneOf: [
                    { type: 'string' },
                    { type: 'number' },
                    { type: 'boolean' },
                    { type: 'null' },
                    {
                        type: 'object',
                        properties: {
                            $guid: {
                                oneOf: [{ type: 'string' }, { type: 'number' }],
                            },
                        },
                        additionalProperties: false,
                    },
                    {
                        // ref to this bit of the subschema
                        $ref: '#/additionalProperties',
                    },
                ],
            },
        },
    },
}

export const validate_mutation = (mutation, orma_schema: OrmaSchema) => {
    const schema_response = validate(mutation, mutate_validation_schema)
    if (schema_response.errors.length > 0) {
        // if the shape of the data is incorrect, we can't run the js validation since this may produce
        // nonsensical results or create actual runtime errors
        return schema_response.errors
    }
    const js_errors = validate_mutation_js(mutation, orma_schema)
    return [...schema_response.errors, ...js_errors]
}

/**
 * Handles the validation that is difficult for JSON schema, e.g. things which rely on the orma schema (and so would
 * require a code-generated JSON schema) or things which reference parent values such as operation inheritance
 */
const validate_mutation_js = (mutation, orma_schema: OrmaSchema) => {
    // check root level props which must be entity names,
    // then generate errors for nested mutations
    const field_errors = Object.keys(mutation)
        .filter(key => !is_reserved_keyword(key))
        .flatMap(key => {
            const value = mutation[key] as any[]

            if (is_entity_name(key, orma_schema)) {
                return value.flatMap((record, i) =>
                    validate_mutation_record(
                        mutation,
                        record,
                        [key, i],
                        orma_schema,
                        mutation.$operation
                    )
                )
            } else {
                return [
                    {
                        message: `Property ${key} is not a valid entity name.`,
                        path: [key],
                        original_data: mutation,
                    },
                ] as OrmaError[]
            }
        })

    return field_errors
}

const validate_mutation_record = (
    mutation,
    record,
    record_path,
    orma_schema: OrmaSchema,
    higher_operation = undefined
): OrmaError[] => {
    const operation = record.$operation ?? higher_operation
    const entity_name = get_ancestor_name_from_path(record_path, 0)

    const errors = [
        ...validate_operation_existence(mutation, record_path, operation),
        ...validate_required_fields(
            mutation,
            record_path,
            record,
            entity_name,
            operation,
            orma_schema
        ),
        ...validate_fields_and_nested_mutations(
            mutation,
            record_path,
            record,
            entity_name,
            operation,
            orma_schema
        ),
        ...validate_identifying_keys(
            mutation,
            record_path,
            record,
            operation,
            orma_schema
        ),
        ...validate_operation_nesting(
            mutation,
            record_path,
            entity_name,
            operation,
            higher_operation,
            orma_schema
        ),
    ]
    return errors
}

const validate_operation_existence = (
    mutation,
    record_path,
    operation: string
) => {
    const errors =
        operation === undefined
            ? [
                  {
                      message: `Records must have an operation or an inherited operation.`,
                      original_data: mutation,
                      path: [...record_path, '$operation'],
                  },
              ]
            : []

    return errors
}

const is_valid_operation_nesting = (
    parent_operation: 'create' | 'update' | 'delete',
    child_operation: 'create' | 'update' | 'delete'
) => {
    // for more info on why these are the only correct nestings, see the mutate plan function
    const is_same = parent_operation === child_operation
    const is_different_but_valid = parent_operation === 'update'
    return is_same || is_different_but_valid
}

const get_ancestor_name_from_path = (
    record_path: (string | number)[],
    nth_ancestor: number
): string => {
    let ancestor_count = 0
    for (let i = 0; i < record_path.length; i++) {
        const path_el = record_path[record_path.length - 1 - i]
        if (typeof path_el === 'string') {
            if (ancestor_count === nth_ancestor) {
                return path_el
            } else {
                ancestor_count += 1
            }
        }
    }

    return undefined
}

const validate_fields_and_nested_mutations = (
    mutation: any,
    record_path: any,
    record: any,
    entity_name: string,
    operation: any,
    orma_schema: OrmaSchema
) => {
    const connected_entities = get_all_edges(entity_name, orma_schema).map(
        el => el.to_entity
    )

    const field_errors = Object.keys(record)
        .filter(key => !is_reserved_keyword(key))
        .flatMap(key => {
            const value = record[key]

            if (connected_entities.includes(key)) {
                // submutation
                if (!Array.isArray(value)) {
                    return [
                        {
                            message: `Nested mutations must be an array.`,
                            path: [...record_path, key],
                            original_data: mutation,
                        },
                    ] as OrmaError[]
                }

                return value.flatMap((nested_record, i) =>
                    validate_mutation_record(
                        mutation,
                        nested_record,
                        [...record_path, key, i],
                        orma_schema,
                        operation
                    )
                )
            } else if (is_field_name(entity_name, key, orma_schema)) {
                // regular field
                if (Array.isArray(value)) {
                    return [
                        {
                            message: `Regular properties can't be arrays.`,
                            path: [...record_path, key],
                            original_data: mutation,
                        },
                    ] as OrmaError[]
                }

                return []
            } else {
                // unknown prop
                return [
                    {
                        message: `Property ${key} is not a valid connected entity or field name.`,
                        path: [...record_path, key],
                        original_data: mutation,
                    },
                ] as OrmaError[]
            }
        })
    return field_errors
}

const validate_required_fields = (
    mutation: any,
    record_path: any,
    record: any,
    entity_name: string,
    operation: any,
    orma_schema: OrmaSchema
) => {
    const required_fields = get_field_names(entity_name, orma_schema).filter(
        field_name => is_required_field(entity_name, field_name, orma_schema)
    )

    const errors: OrmaError[] = required_fields.flatMap(required_field => {
        // required fields are only applicable in creates, for updates (and deletes), the user never needs to
        // supply anything since required fields would already be in the database
        if (operation === 'create' && record[required_field] === undefined) {
            // any foreign key that is for a connected parent record does not have to be supplied by the user since it
            // will be auto-inserted via foreign key propagation from the parent. (the parent record must be a create
            // to have a valid operation nesting, since this record is a create)
            const foreign_keys = get_foreign_keys_in_mutation(
                mutation,
                record_path,
                orma_schema
            )

            const required_field_is_foreign_key = foreign_keys
                .map(({ edge }) => edge.from_field)
                .includes(required_field)

            if (!required_field_is_foreign_key) {
                return [
                    {
                        message: `The field ${required_field} is not in the mutation but it is required to create a ${entity_name}.`,
                        path: [...record_path, required_field],
                        original_data: mutation,
                    },
                ]
            }
        }

        return []
    })

    return errors
}

const validate_operation_nesting = (
    mutation: any,
    record_path: any,
    entity_name: string,
    operation: 'create' | 'update' | 'delete',
    higher_operation: 'create' | 'update' | 'delete',
    orma_schema: OrmaSchema
) => {
    const higher_entity = get_ancestor_name_from_path(record_path, 1)
    const higher_entity_is_parent = is_parent_entity(
        higher_entity,
        entity_name,
        orma_schema
    )
    const parent_operation = higher_entity_is_parent
        ? higher_operation
        : operation
    const child_operation = higher_entity_is_parent
        ? operation
        : higher_operation

    let operation_nesting_errors: OrmaError[] = []
    // if either the current operation or the higher operation are undefined, it doesnt make sense to talk about
    // checking the operation nesting. In either case, we are either guaranteed a good operation nesting (e.g.
    // we are dealing with a root level record, which has no higher operation) or we already got an error from the
    // $operation existence check. In any case, we don't need to generate an error here.
    // Additionally, the top layer of records always can be any operation, so we dont need to check those either 
    // (the higher operation is the root operation, but that is only used as an override)
    if (
        operation !== undefined &&
        higher_operation !== undefined &&
        record_path.length > 2 && // 0 = root, 1 = inside array, 2 = top layer of objects
        !is_valid_operation_nesting(parent_operation, child_operation)
    ) {
        const parent_entity = higher_entity_is_parent
            ? higher_entity
            : entity_name
        const child_entity = higher_entity_is_parent
            ? entity_name
            : higher_entity

        operation_nesting_errors.push({
            message: `Invalid operation nesting. Parent ${parent_entity} has operation ${parent_operation} while child ${child_entity} has operation ${child_operation}`,
            path: [...record_path, '$operation'],
            original_data: mutation,
            additional_info: {
                parent_entity,
                child_entity,
                parent_operation,
                child_operation,
            },
        })
    }

    return operation_nesting_errors
}

const validate_identifying_keys = (
    mutation: any,
    record_path: any,
    record: any,
    operation: any,
    orma_schema: OrmaSchema
) => {
    let identifying_key_errors: OrmaError[] = []
    if (operation === 'update' || operation === 'delete') {
        const entity_name = get_ancestor_name_from_path(record_path, 0)
        const identifying_keys = get_identifying_keys(
            entity_name,
            record,
            orma_schema
        )

        if (identifying_keys.length === 0) {
            identifying_key_errors = [
                {
                    message: `Could not find primary keys or unique keys in record to ${record.$operation}.`,
                    path: record_path,
                    original_data: mutation,
                    // stack_trace: new Error().stack,
                    additional_info: {
                        identifying_columns: identifying_keys ?? 'none',
                    },
                },
            ]
        }
    }
    return identifying_key_errors
}
