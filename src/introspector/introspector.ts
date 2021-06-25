import { deep_set } from '../helpers'

export const introspect = () => {
    return 'introspectt'
}

export interface mysql_table {
    table_name: string
    table_comment?: string
}

export interface mysql_column {
    table_name: string
    column_name: string
    ordinal_position: number
    column_default?: string | number
    is_nullable?: string
    data_type: string
    character_maximum_length?: number
    numeric_precision?: number
    numeric_scale?: number
    datetime_precision?: number
    column_key?: 'PRI' | 'UNI' | 'MUL'
    extra?: string
    generation_expression?: string
    column_comment?: string
}

export interface mysql_foreign_key {
    table_name: string
    column_name: string
    referenced_table_name: string
    referenced_column_name: string
    constraint_name: string
}

export const get_introspect_sqls = (database_name): string[] => {
    const query_strings = [
        `SELECT 
            table_name, 
            table_comment 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE table_schema='${database_name}'`,

        `SELECT 
            column_name, 
            table_name,
            data_type,
            column_type,
            column_key,
            is_nullable,
            numeric_precision,
            numeric_scale,
            character_maximum_length,
            column_default,
            column_comment
        FROM information_schema.COLUMNS  
        WHERE table_schema = '${database_name}'`,

        `SELECT 
            table_name, 
            column_name,
            referenced_table_name,
            referenced_column_name,
            constraint_name
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE REFERENCED_TABLE_SCHEMA = '${database_name}'`
    ]

    return query_strings
}

export const generate_database_schema = (mysql_tables: mysql_table[], mysql_columns: mysql_column[], mysql_foreign_keys: mysql_foreign_key[]) => {
    // const schema = {
    //     entities: {
    //         products: {
    //             comment: 'A list of products',
    //             fields: {
    //                 id: {
    //                     references: {
    //                         vendors: { id: {} }
    //                     },
    //                     required: true,
    //                     indexed: true,
    //                     unique: true,
    //                     primary_key: true
    //                 },
    //                 // ...
    //             },
    //         },
    //         // ...
    //     },
    // }

    const database_schema = {
        entities: {}
    }

    for (const mysql_table of mysql_tables) {
        database_schema.entities[mysql_table.table_name] = {
            comment: mysql_table.table_comment,
            fields: {}
        }
    }

    for (const mysql_column of mysql_columns) {
        const field_schema = generate_field_schema(mysql_column)

        database_schema.entities[mysql_column.table_name].fields[mysql_column.column_name] = field_schema
    }

    for (const mysql_foreign_key of mysql_foreign_keys) {
        const {
            table_name,
            column_name,
            referenced_table_name,
            referenced_column_name,
            constraint_name
        } = mysql_foreign_key

        const reference_path = ['entities', table_name, 'fields', column_name, 'references', referenced_table_name, referenced_column_name]
        deep_set(database_schema, reference_path, {})

    }

    return database_schema
}

export const generate_field_schema = (mysql_column: mysql_column) => {
    
    const simple_data_types_by_mysql_data_types = {
        bigint: "number",
        binary: "string",
        bit: "not_supported",
        blob: "not_supported",
        bool: "boolean",
        boolean: "boolean",
        char: "string",
        date: "data",
        datetime: "data",
        decimal: "number",
        double: "number",
        enum: "enum",
        float: "number",
        int: "number",
        longblob: "not_supported",
        longtext: "string",
        mediumblob: "not_supported",
        mediumint: "number",
        mediumtext: "string",
        set: "not_supported",
        smallint: "number",
        text: "string",
        time: "data",
        timestamp: "data",
        tinyblob: "not_supported",
        tinyint: "boolean",
        tinytext: "string",
        varbinary: "string",
        varchar: "string"
    }

    const {
        table_name,
        column_name,
        ordinal_position,
        column_default,
        is_nullable,
        data_type,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        datetime_precision,
        column_key,
        extra,
        generation_expression,
        column_comment
    } = mysql_column

    const field_schema: Record<string, unknown> = {
        data_type: simple_data_types_by_mysql_data_types[data_type],
        ordinal_position
    }

    // indices
    if (is_nullable === 'NO') {
        field_schema.required = true
    }

    if (column_key === 'PRI' || column_key === 'UNI' || column_key === 'MUL') {
        field_schema.indexed = true
    }

    if (column_key === 'PRI' || column_key === 'UNI') {
        field_schema.unique = true
    }

    if (column_key === 'PRI') {
        field_schema.primary_key = true
    }

    // data constraints
    if (numeric_precision) {
        field_schema.character_count = numeric_precision
    }

    if (character_maximum_length) {
        field_schema.character_count = character_maximum_length
    }

    if (numeric_scale) {
        field_schema.decimal_places = numeric_scale
    }

    if (datetime_precision) {
        field_schema.decimal_places = datetime_precision
    }

    // defaults
    if (column_default) {
        field_schema.default = column_default
    }

    if (extra === 'auto_increment') {
        field_schema.default = extra
    }

    // comment
    if (column_comment) {
        field_schema.comment = column_comment
    }

    return field_schema
}