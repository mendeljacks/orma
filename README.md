## Orma
Orma is a light-weight declarative ORM for sql databases.

Orma uses json syntax to represent queries and mutations.
Queries are objects specifying which fields to query. Only fields which
are requested will be selected. Symbols with a $ are called macros and are used to represent abstractions to the sql AST. Sql keywords can be accessed with the $ prefix and snake case. (eg $group_by, $limit, $where) 

Orma performs a single pass toposort to decompose requests into the minimum number of sql queries. Orma will group requests such that they are as parallel as possible while ensuring parents get created before children,
so that foreign key references can inserted into children tables.

Key Features
- Powerful
    - Mixed operations (create, update, delete in one request)
    - Nested Queries and Mutations (automatic foreign key propogation)
    - Powerful JSON query syntax
- Portable
    - Can run server-side or client-side (for sql-lite)
    - BYO connection pool
    - No external dependencies
- Performant
    - Batched insert statements.
    - Multi stage query planning

## Getting started

```
npm i orma  // Or yarn add orma
```

## Introspect

The orma schema contains column and foreign keys which
are needed for queries and mutations. Databases can be introspected at runtime or saved as json.

```js
import { orma_introspect } from 'orma'
import mysql from 'mysql2'

// Using a promise pool
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
const pool_query = async sql_strings => {
    const results = await pool
        .query(sql_strings.join(';'))
        .then(res => (sql_strings.length === 1 ? [res[0]] : res[0]))
    return results
}

const orma_schema = await orma_introspect(env.database, pool_query)
```

## Queries

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
```

## Mutations

To inserting and updating records is achieved by
providing an array of objects. Nesting will be normalised,
upon insertion. 


```js
// Another snippet
```

## Examples

```js
// How to run a long lived transaction
```

```js
// How to batch insert nested tables
```

```js
// How to query for table1 where table2 matches a criteria
```

```js
// How to query all table1 including table2 when table2 matches a criteria
```

```js
// How to use any/all for hierarcy queries eg permissions
```

```js
// How to use $op cascading
```

# Power user examples
