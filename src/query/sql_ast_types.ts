export type CreateTableStatement = ({
    $temporary: boolean,
    $columns: 
} | {
    // this is untyped for now, but this should be a select statement when the type is available
    $like: Record<string, any> 
}) & CreateTableCommonProps

type CreateTableCommonProps = {
    $create_table: string,
    $if_not_exists: boolean,
}