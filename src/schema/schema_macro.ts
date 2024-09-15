import { get_difference } from '../helpers/helpers'
import { get_all_edges } from '../helpers/schema_helpers'
import {
    MutationPiece,
    get_mutation_batches
} from '../mutate/plan/mutation_batches'
import {
    ConstraintDefinition,
    ColumnDefinition,
    IndexDefinition,
    RegularCreateStatement
} from '../compiler/schema/schema_ast_types'
import { OrmaSchema, SupportedDatabases } from './schema_types'

export const get_schema_diff = (
    original_schema: OrmaSchema,
    final_schema: OrmaSchema
) => {
    const original_tables = Object.keys(original_schema.tables)
    const final_tables = Object.keys(final_schema.tables)

    const tables_to_create = get_difference(final_tables, original_tables)
    const create_table_statements = tables_to_create.map(table =>
        get_create_table_statements(table, final_schema.tables[table])
    )

    const sorted_create_statements = get_sorted_create_table_statements(
        final_schema,
        create_table_statements
    )

    const standalone_index_statements = tables_to_create.flatMap(table =>
        get_standalone_index_statements(table, final_schema.tables[table])
    )

    return [...sorted_create_statements, ...standalone_index_statements]
}

const get_create_table_statements = (
    table_name: string,
    table_schema: OrmaSchema['tables'][string]
) => {
    const database_type = table_schema.database_type

    const columns: ColumnDefinition[] =
        Object.keys(table_schema.columns).map(column_name => {
            const column_schema = table_schema.columns[column_name]
            // For sqlite to do auto incrementing, we need the magic INTEGER PRIMARY KEY
            // type. Having UNSIGNED or a precision like INTEGER(10) will cause it to
            // not auto increment.
            if (database_type === 'sqlite' && column_schema.$auto_increment) {
                return {
                    $name: column_name,
                    $data_type: 'int',
                    $auto_increment: true
                }
            } else {
                return {
                    $name: column_name,
                    ...column_schema
                }
            }
        }) ?? []

    const primary_key: ConstraintDefinition = {
        $constraint: 'primary_key',
        ...table_schema.primary_key
    }

    const unique_keys: ConstraintDefinition[] =
        table_schema?.unique_keys?.map(el => ({
            $constraint: 'unique_key',
            ...el
        })) ?? []

    const foreign_keys: ConstraintDefinition[] =
        table_schema?.foreign_keys?.map(el => ({
            constraint: 'foreign_key',
            ...el
        })) ?? []

    const indexes: IndexDefinition[] =
        table_schema?.indexes?.map(el => ({
            ...(el.$index ? { $index: el.$index } : { $index: true }),
            ...el
        })) ?? []

    return {
        $create_table: table_name,
        $comment: table_schema.$comment,
        $definitions: [
            ...columns,
            ...unique_keys,
            ...foreign_keys,
            // primary key and indexes are special cases in sqlite that are handled separately
            ...(database_type !== 'sqlite' ? [primary_key] : []),
            ...(standalone_index_dbs.includes(database_type) ? [] : indexes)
        ]
    }
}

/**
 * Unlike literally everything else like table options, columns, constraints, foreign keys etc,
 * SQLite insists that indexes are created using a completely separate CREATE INDEX syntax.
 * So this needs to be done separately to cover for SQLite's poor design choices.
 */
const standalone_index_dbs: SupportedDatabases[] = ['sqlite', 'postgres']

const get_standalone_index_statements = (
    table_name: string,
    table_schema: OrmaSchema['tables'][string]
) => {
    if (!standalone_index_dbs.includes(table_schema.database_type)) {
        // indexes handled in the create statement for non-sqlite
        return []
    }

    const indexes: IndexDefinition[] =
        table_schema?.indexes?.map(el => ({
            ...(el.$index ? { $index: el.$index } : { $index: true }),
            ...el
        })) ?? []

    return indexes.map(index => ({
        $create_index: index.$name,
        $on: {
            $table: table_name,
            $columns: index.$columns
        }
    }))
}

const get_sorted_create_table_statements = (
    final_schema: OrmaSchema,
    create_statements: RegularCreateStatement[]
) => {
    // we make a fake mutation, which allows us to use the mutation planner to order our statements.
    const mutation_pieces: MutationPiece[] = create_statements.map(
        (statement, i) => {
            const table = statement.$create_table
            // remove self-referencing foreign keys, since they dont affect insertion order
            // and would make this more complicated if included
            const edges = get_all_edges(table, final_schema).filter(
                el => el.from_table !== el.to_table
            )

            // we set all foreign key and primary keys to the value 1, since this will result in the strongest
            // ordering when passed to the mutation planner
            const edge_columns_obj = edges.reduce((acc, edge) => {
                acc[edge.from_columns] = 1
                return acc
            }, {} as Record<string, any>)

            return {
                path: [table, 0],
                record: {
                    $operation: 'create',
                    // keep track of the statement to convert the sorted mutation pieces back to statements
                    $_statement_index: i,
                    ...edge_columns_obj
                }
            }
        }
    )

    const mutation_plan = get_mutation_batches(final_schema, mutation_pieces)
    const sorted_statements = mutation_plan.mutation_pieces.map(
        ({ record }) => create_statements[record.$_statement_index]
    )

    return sorted_statements
}
