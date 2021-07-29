## Orma

Update read format,
----------🚧 THIS PROJECT IS A WORK IN PROGRESS 🚧----------

Orma is a declarative, syncronous, dependency free ORM.

Orma provides introspection, validation, query construction and mutations.
The package uses json format to represent sql queries and mutations.

When the database is instrospected a declarative schema is generated as a json object.
Typescript types are also generated.

The orma schema can be diffed by the user and validated using runtime schema validation functions.

To construct orma queries, pass a json object with columns to include or subqueries similar to graphql. Reserved sql keywords can be accessed with the $ prefix and snake case. (eg $group_by, $limit, $where)

To construct orma mutations, pass a json object with nested objects and the schema. Orma
will use a single pass toposort algorithm to decompose into the minimum number of batch
insert requests and run them in parallel ensuring parents get created before children,
and foreign key references are inserted into children tables.

Key Advantages

Disadvantages
Supports sql databases only

## Installation

```
npm i orma  // Or yarn add orma
```

## Intospect a mysql database

Introspecting the database will produce a json object called the orma schema.
The orma schema describes the table column and foreign key information which
are needed for queries and mutations.

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
// At this point you may diff the json schema if needed and save it for later use.
```

## Construct queries

Orma queries are json objects. In the following scenario, a nested query is made.

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

## Construct Mutations

Mutation format is the same as from the read uil...
Operations are nested in as meta on each level...
Here is where we explain what recursive op hierarchy alternative to graphql

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
