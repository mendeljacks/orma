export const sql_to_typescript_types = {
    bigint: 'number',
    binary: 'string',
    bit: 'not_supported',
    blob: 'not_supported',
    bool: 'boolean',
    boolean: 'boolean',
    char: 'string',
    date: 'string',
    datetime: 'string',
    decimal: 'number',
    double: 'number',
    enum: 'enum',
    float: 'number',
    int: 'number',
    longblob: 'not_supported',
    longtext: 'string',
    mediumblob: 'not_supported',
    mediumint: 'number',
    mediumtext: 'string',
    set: 'not_supported',
    smallint: 'number',
    text: 'string',
    time: 'string',
    timestamp: 'string',
    tinyblob: 'not_supported',
    tinyint: 'boolean',
    tinytext: 'string',
    varbinary: 'string',
    varchar: 'string',
    json: 'string'
} as const

export const mysql_types = new Set(Object.keys(sql_to_typescript_types))

type MysqlToTypescriptTypes = typeof sql_to_typescript_types

export type TypescriptTypeByMysqlType = {
    [Key in keyof MysqlToTypescriptTypes]: ColumnTypeStringToType<
        MysqlToTypescriptTypes[Key]
    >
}

type ColumnTypeStringToType<
    TypeString extends
        | 'string'
        | 'number'
        | 'boolean'
        | 'date'
        | 'not_supported'
        | 'enum'
> = TypeString extends 'string'
    ? string
    : TypeString extends 'number'
    ? number
    : TypeString extends 'boolean'
    ? number | boolean // mysql doesnt really support booleans
    : TypeString extends 'date'
    ? string
    : TypeString extends 'enum'
    ? string
    : TypeString extends 'not_supported'
    ? never
    : any
