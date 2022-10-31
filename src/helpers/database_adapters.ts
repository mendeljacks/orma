import { OrmaStatement } from '../mutate/statement_generation/mutation_statements'

export const mysql2_adapter =
    (connection: { query: Function }) =>
    async (statements: OrmaStatement[]): Promise<Record<string, any>[][]> => {
        const sqls = statements.map(statement => statement.sql_string)
        if (sqls.length === 0) {
            return []
        }

        const sql = sqls.join(';\n')
        const [rows, field_packets]: [
            Record<string, any>[] | Record<string, any>[][],
            any
        ] = await connection.query(sql)

        // always return an array of arrays
        if (!Array.isArray(rows[0])) {
            return [rows]
        } else {
            // @ts-ignore
            return rows
        }
    }
