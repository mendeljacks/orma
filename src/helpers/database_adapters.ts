import { OrmaStatement } from '../mutate/statement_generation/mutation_statements'

export const mysql2_adapter =
    (connection: { query: Function }) =>
    async (statements: AdapterStatements): AdapterReturn => {
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

// Setup a function which given sql strings can return an array of results
export const pg_adapter =
    (connection: { query: Function }) =>
    async (statements: AdapterStatements): AdapterReturn => {
        const sqls = statements.map(statement => statement.sql_string)
        if (sqls.length === 0) {
            return []
        }

        const sql = sqls.join(';\n')
        const response = await connection.query(sql)

        // pg driver returns array only when multiple statements detected
        if (!Array.isArray(response)) {
            return [response.rows]
        } else {
            return response.map(row => row.rows)
        }
    }

export const sqlite3_adapter =
    (connection: { all: Function }) =>
    async (statements: AdapterStatements): AdapterReturn => {
        const sqls = statements.map(statement => statement.sql_string)
        if (sqls.length === 0) {
            return []
        }

        let response: Awaited<AdapterReturn> = []
        for await (const sql of sqls) {
            const rows = await new Promise<Record<string, any>[]>(
                (resolve, reject) =>
                    connection.all(sql, [], (err, rows) => {
                        if (err) {
                            reject(err)
                        }
                        resolve(rows)
                    })
            )
            response.push(rows)
        }

        return response
    }

// Setup a function which will be able to facilitate multiple queries to happen on a single transaction
// Orma mutations will operate on a single transaction if configured to do so.
export const postgres_promise_transaction = async (fn, pool) => {
    const connection = await pool
        .connect()
        .catch(err =>
            Promise.reject({ message: 'Could not start connection', err })
        )
    try {
        await connection.query('BEGIN')
        const res = await fn(connection)
        await connection.query('COMMIT')
        await connection.release()
        return res
    } catch (err) {
        await connection.query('ROLLBACK')
        await connection.release()
        return Promise.reject(err)
    }
}

type AdapterReturn = Promise<Record<string, any>[][]>
type AdapterStatements = Pick<OrmaStatement, 'sql_string'>[]
