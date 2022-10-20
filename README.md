# What is Orma?

Orma is a light-weight declarative ORM for SQL databases.

Orma makes it easy to use JSON based GraphQL style syntax to query and mutate existing databases.


Key Features
- Powerful
    - Mixed operations (create, update, delete in one request)
    - Nested Queries and Mutations (automatic foreign key propogation)
    - Powerful JSON query syntax with automatic typescript for queries and mutations
- Portable
    - Can run server-side or client-side (for sql-lite)
    - BYO connection pool
- Performant
    - Batched insert statements.
    - Multi stage query planning

Orma also helps with validation, sql injection protection, while leaving the rest of the database management to the programmer. The programmer will be responsible for providing a configured connection pool so that sql strings can get executed.


## Getting started

Try out the Interactive playground
https://orma-playground.web.app/

Install orma as well as your favorite database adapter
```
npm i orma
npm i pg
(or npm i mysql2)
```

## Orma Schema

The orma schema is a JSON object that is required when
making queries or mutations. The schema contains table names, column names, as well as foreign key references and uniqness constraints and can be introspected directly by reading a live database or written manually.

### Automatic Introspection

Orma allows management of database schemas to be handled by the programmer which means it is easy to integrate with existing databases.
It is recommended to use a migration system such as db-migrate, and have the underlying orma schema be generated and saved to disk. While it is possible to introspect at runtime, it is recommended to persist and commit orma schemas to your repo, to get better typescript support.

Example of a mysql database being introspected.
```js
// Example introspection of a mysql database
import { orma_introspect } from 'orma'
import mysql from 'mysql2'

const pool = mysql
    .createPool({
        host: env.host,
        port: env.port,
        user: env.user,
        password: env.password,
        database: env.database,
        multipleStatements: true
    })
    .promise()

// Setup a function which given sql strings can return an array of results
const byo_query_fn = async sql_strings => {
    const results = await pool
        .query(sql_strings.join(';'))
        .then(res => (sql_strings.length === 1 ? [res[0]] : res[0]))
    return results
}

const orma_schema = await orma_introspect(env.database, byo_query_fn)

// Example response
// {
//     "users": {
//         "id": {
//           "data_type": "bigint",
//           "not_null": true,
//           "primary_key": true,
//         },
//         "email": {
//             "data_type": "character varying",
//           "not_null": true,
//           "character_count": 10485760
//         },
//         "first_name": {
//           "data_type": "character varying",
//           "ordinal_position": 4,
//           "character_count": 10485760
//         },
//         ...    
//     }
//     ...
// }

```





Example of a postgres database being introspected.
```js
// Example for introspection of Postgresql (also used for cockroachdb)
import { writeFileSync } from 'fs'
import { orma_introspect, orma_mutate, orma_query } from 'orma/src/index'
import { Pool, types } from 'pg'
import { apply_inherit_operations_macro } from 'orma/src/mutate/macros/inherit_operations_macro'
import { validate_mutation } from 'orma/src/mutate/verifications/mutate_validation'
import { mutation_entity_deep_for_each } from 'orma/src/mutate/helpers/mutate_helpers'
import { pool, trans } from './pg'
import cuid from 'cuid'
import { orma_schema } from '../../generated/orma_schema'

// To save results of introspection to disk using fs
export const introspect = async db => {
    const orma_schema = await orma_introspect('public', byo_query_fn, { database_type: 'postgres' })
    try {
        const str = `export const orma_schema = ${JSON.stringify(orma_schema, null, 2)} as const`
        writeFileSync('./generated/orma_schema.ts', str)
    } catch (error) {
        console.log('Could not save the orma schema')
    }
}

// Postgres driver config for casting of data types.
// In this example dates are cast to strings, and int to js numbers
types.setTypeParser(20, (val) => parseInt(val, 10))
types.setTypeParser(1084, date => date)
types.setTypeParser(1114, date => date)

export const pool = new Pool({
    connectionString: env.pg,
    types,
    ssl: { rejectUnauthorized: false }
})

// Setup a function which will be able to facilitate multiple queries to happen on a single transaction
// Orma mutations will operate on a single transaction if configured to do so.
export const trans = async fn => {
    const connection = await pool
        .connect()
        .catch(err => Promise.reject({ message: 'Could not start connection', err }))
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

// Setup a function which given sql strings can return an array of results
export const byo_query_fn = async (sqls: { sql_string }[], connection = pool) => {
    const sql = sqls.map(el => el.sql_string).join(';\n')
    const response = await connection.query(sql)

    // pg driver returns array only when multiple statements detected
    if (!Array.isArray(response)) {
        return [response.rows]
    } else {
        return response.map(row => row.rows)
    }
}

// It is recommended that every table in the database have a unique column called resource_id
// When there is at least one non database generated unique column, an optimization is performed to query for results in batch following a create, so that generated ids get passed to child tables.
const add_resource_ids = (mutation: any) => {
    mutation_entity_deep_for_each(mutation, (value, path) => {
        if (value?.$operation === 'create') {
            const resource_id = cuid()
            value.resource_id = resource_id
        }
    })
}

export const mutate_handler = mutation => {
    return trans(async connection => {
        apply_inherit_operations_macro(mutation)
        add_resource_ids(mutation)

        // Leveraging orma json schema based runtime validator to prevent accidental misuse.
        const errors = validate_mutation(mutation, orma_schema)
        if (errors.length > 0) {
            return Promise.reject(errors)
        }

        // Run orma mutation
        const mutation_results = await orma_mutate(
            mutation,
            sqls => byo_query_fn(sqls, connection),
            orma_schema
        )
        return mutation_results
    })
}

```

```js
// Example express server exposing entire schema as a json endpoint
import cors from 'cors'
import express from 'express'
import { handler } from 'express_phandler'

// You may wish to expose the mutate and query handler functions directly to an express api
app.post(
        '/query',
        handler(async (req, res) => {
            const results = await query_handler(req.body)
            return results
        })
    )

app.post(
        '/mutate',
        handler(async req => mutate_handler(req.body))
    )

// For multi-tenancy use cases, you may wish to setup additional rbac and authentication middleware
// See demos for more information.
```

# Queries

Once you have established a connection to your database you can begin querying.

Orma queries are objects in which you can specify which fields you would like to be returned in the response.

In the following scenario, a users table and and an addresses table are present. Each address has a user_id.
A nested query would be constructed as follows:

```js
const query = {
    users: {
        id: true,
        first_name: true,
        last_name: true,
        addresses: {
            id: true
        }
    }
}
const results = await orma_query(query, orma_schema, pool_query)
// { users: [{ id: 2389, first_name: 'John' addresses: [{ id: 22 }]}] }
```

```js
// Example query of first 10 users with their first 10 US addresses
const query = {
    users: {
        id: true,
        first_name: true,
        last_name: true,
        $offset: 0,
        $limit: 10,
        addresses: {
            id: true,
            $offset: 0,
            $limit: 10,
            $where: { $eq: ['country', {$escape: 'US'}]} // <-- It is recommended to escape all user input to avoid SQL injection
        }
    }
}

// Similar query, but this time only get the first 10 users who have at least one Canadian address.
const query = {
    users: {
        id: true,
        first_name: true,
        last_name: true,
        addresses: {
            id: true,
        },
        $where: { $any: ['addresses.country', {$escape: 'CA'}]}
    }
}

// Chaining multiple where clauses with and / or statements
const query = {
    users: {
        id: true,
        first_name: true,
        last_name: true,
        $where: { $and: [{ $eq: ['first_name', {$escape: 'John'}]}, { $eq: ['last_name', {$escape: 'Doe'}]}]}
    }
}
```

Notice that the query syntax is similar to graphql. Each column in the query will be fetched from the database and returned in the response in the same shape as the query. Since it is JSON based the true is required next to each column name. {$as: 'new_column_name'} is also supported in place of the boolean if desired. In the above example because the address table has a user_id on it, orma will know to join the addresses of each user to their spot in the response. You can also query tables in their reverse order such as addresses with users inside and this will be honored in the response as well.

Searching, paginating, sorting and more advanced filtering are implemented using a $ syntax.
Keywords which begin with $ are called macros and are used to represent abstractions of the sql AST. SQL keywords can be accessed with the $ prefix and snake case. (eg $group_by, $limit, $where)


Query performance is due to ormas single pass toposort which decomposes requests into the minimum number of sql queries. Orma will then group requests to be executed as parallel as possible while ensuring to wait for the results of some requests which are required for subsequent requests such as parents getting created before children tables and where in statements being resolved.

## Mutations

To insert, update or delete rows, mutations are used. 

An orma mutations are json based and support batch operations.
When tables are passed in nested format, orma will normalised them for insertion to the database.



```js
// Example of creating new rows in batch
const mutation = {
    $operation: 'create',
    users: [{
        first_name: 'John',
        last_name: 'Doe'
    },
    {
        first_name: 'Jane',
        last_name: 'Smith'
    }]
}
```

```js
// Example of nested creation
const mutation = {
    $operation: 'create',
    users: [{
        first_name: 'John',
        last_name: 'Doe'
        posts: [{
            title: 'Post 1',
            message: 'Hello world'
        }]
    }]
}
```
You can mix and match any combination of batch and nested operations.
By default the operation at the top will be inherited all the way down, however you can have mixed operations in the same request for example:
```js
// Example of creating a user while deleting a user by unique column and updating a unother by id
const mutation = {
    users: [{
        $operation: 'create',
        first_name: 'John',
        last_name: 'Doe'
    }, {
        $operation: 'delete',
        email: 'john@gmail.com',
    }, {
        $operation: 'update',
        id: 123,
        last_name: 'Doe'
    }]
}
```
# Additional features

- Using {$guid: '...'} in two spots can be used to bypass circular dependencies in mutations (acts as a temporary identifier for the row)
- Results of queries can always be passed directly to mutations with contents changed and it will work as expected.
- Anypath and anyconnected can be used for row based multi-tenancy
