export const mysql2_adapter =
    (connection: { query: Function }) =>
    async (sqls: string[]): Promise<Record<string, any>[][]> => {
        if (sqls.length === 0) {
            return []
        }

        const sql = sqls.join(';\n')
        const [rows, field_packets]: [
            Record<string, any>[] | Record<string, any>[][],
            any
        ] = await connection.query(sql)

        if (!Array.isArray(rows[0])) {
            return [rows]
        } else {
            // @ts-ignore
            return rows
        }
    }
