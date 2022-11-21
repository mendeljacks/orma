# What is Orma?

Orma is a JSON-based, statically typed query language for SQL databases.



At its heart, Orma's mission is simple: convert a parsable, serializable and type-safe JSON syntax into SQL strings. However Orma builds on its base SQL syntax by providing other features such as validation, multi-tenancy, database introspection, declarative foreign keys and more. In other words, Orma provides the tools to secure and simplify your database queries, while still exposing the full power of SQL.

## Key Features

💪 Powerful
- Nested queries and mutations
- Mixed operations (create, update and delete in one request)
- Extensive SQL-based syntax
- Automatic typescript for queries and mutations

🛹 Portable
- Pure JS with no code generation
- BYO database connector

🕥 Performant
- All SQL statements are batched
- Query planning for maximum parallelization

# Table of contents
- [What is Orma?](#what-is-orma)
  - [Key Features](#key-features)
- [Table of contents](#table-of-contents)
- [Getting started](#getting-started)
  - [Database connector](#database-connector)
  - [Orma Schema](#orma-schema)
    - [Introspection](#introspection)
- [Queries](#queries)
  - [Setup](#setup)
  - [Structure](#structure)
  - [Renaming](#renaming)
  - [SQL functions](#sql-functions)
  - [Pagination](#pagination)
  - [Filtering](#filtering)
    - [Basic operations](#basic-operations)
    - [Connectives](#connectives)
    - [$any_path](#any_path)
    - [Subqueries in $where clauses](#subqueries-in-where-clauses)
    - [Referencing fields](#referencing-fields)
  - [Grouping and ordering](#grouping-and-ordering)
  - [$select and $as](#select-and-as)
- [Mutations](#mutations)
  - [Mutation diffs](#mutation-diffs)
  - [Operations](#operations)
  - [Operation cascading](#operation-cascading)
  - [Record identifiers](#record-identifiers)
  - [Creating in batch](#creating-in-batch)
  - [Guids](#guids)
- [Multitenancy](#multitenancy)
  - [Connection edges](#connection-edges)
  - [Restricting $where_connected](#restricting-where_connected)
  - [Setting connection edges](#setting-connection-edges)
- [Advanced use cases](#advanced-use-cases)
  - [Custom SQL](#custom-sql)
- [Other projects](#other-projects)
- [Extra examples](#extra-examples)

# Getting started

Try out the Interactive playground
https://orma-playground.web.app/

To install orma with npm, run
```
npm install orma
```

## What can orma do?
This examples demonstrates some of orma's features by querying some data from a database, editing that data and saving it back to the database.

```js
import mysql from 'mysql2'
import { get_mutation_diff, orma_query, orma_mutate, mysql2_adapter } from 'orma'
import { orma_schema } from './orma_schema'

// set up our database connection. Orma does not make its own database connection 
// so that the programmer has access to and control over any SQL queries that are run
const pool = mysql
    .createPool({
        host: env.host,
        port: env.port,
        user: env.user,
        password: env.password,
        database: env.database,
        multipleStatements: true,
    })
    .promise()

const orma_sql_function = mysql2_adapter(pool)

// fetch data from the database using a query
const query = {
    // This query only has access to users 1 and 2.
    // Only records connected to these users will be returned.
    $where_connected: [{
        $entity: 'users',
        $field: 'id',
        $values: [1, 2]
    }],
    // return all the users we have access to
    users: {
        id: true,
        first_name: true,
        email: true,
        // return posts for each user
        posts: {
            id: true,
            title: true,
            views: true,
            // only return posts that have 100 or more views, 
            // or whose title starts with 'First'
            $where: {
                $or: [{
                    $gte: ['view', { $escape: 100 }]
                }, {
                    $like: ['title', { $escape: 'First%' }]
                }]
            }
        }
    },
}

// execute the query
const original = await orma_query(query, orma_schema, orma_sql_function)
// {
//     users: [{
//         id: 1,
//         first_name: 'Alice',
//         email: 'aa@a.com',
//         posts: [{
//             id: 10
//             title: 'First post!',
//             views: 2
//         }, ...]
//     }, ...]
// }

// create a copy of the original data with a different view count
const modified = clone(original)
modified.users[0].posts[0].views = 3

// automatically compute the difference between the original and modieifed versions,
// and store it in an orma mutation
const mutation_diff = get_mutation_diff(original, modified)

// save the changes to the database
await orma_mutate(mutation_diff, orma_sql_function, orma_schema)

// the post with id 10 now has 3 views instead of 2
```

## Database connector

Orma is not opinionated on database connectors, so feel free to use your favourite one. The examples here will use [mysql2](https://www.npmjs.com/package/mysql2). To use Orma with a database library that is not yet supported, you can write your own adapter. This is relatively straightforward to implement, please check the [source code](src/helpers/database_adapters.ts) for details on what the adapter needs to do.

Example setup:

```typescript
import mysql from 'mysql2'
import { mysql2_adapter } from 'orma'

const pool = mysql
    .createPool({
        host: env.host,
        port: env.port,
        user: env.user,
        password: env.password,
        database: env.database,
        multipleStatements: true,
    })
    .promise()

const orma_sql_function = mysql2_adapter(pool)
```
> ⚠️ The mysql2 adapter generates SQL statements separated by semicolons, so make sure they are enabled in the connector config.
## Orma Schema

The orma schema is a JSON object which is required to make queries or mutations. The schema contains all the information about a database that Orma needs, such as entity / field names, foreign keys and indexes. The schema is regular JSON, so it can be created dynamically at runtime, or fetched via an HTTP request. However, to get proper type-safety and intellisense, it is recommended to save the schema to disk.

### Introspection

While Orma schemas can be hand-written, there is currently no way to apply an Orma schema onto a database. Instead, a schema can be introspected from an existing database which can be managed through other tools such as [db-migrate](https://www.npmjs.com/package/db-migrate). For intellisense to work, the schema must be saved to a .ts file and have 'as const' at the end.

Here is an example of a mysql database being introspected:

```js
const orma_schema = await orma_introspect('database_name', orma_sql_function, {
    database_type: 'mysql',
})

const orma_schema_string = `export const orma_schema = ${JSON.stringify(
    orma_schema,
    null,
    2
)} as const`

writeFileSync('./orma_schema.ts', orma_schema_string)
```

The generated schema will look something like this:

```js
// {
//     "users": {
//         "id": {
//              "data_type": "bigint",
//              "not_null": true,
//              "primary_key": true,
//         },
//         "email": {
//              "data_type": "character varying",
//              "not_null": true,
//              "character_count": 10485760
//         },
//         "first_name": {
//              "data_type": "character varying",
//              "ordinal_position": 4,
//              "character_count": 10485760
//         },
//         ...
//     }
//     ...
// }
```

# Queries

## Setup

Queries are executed though the orma_query function:

```js
import { orma_query, validate_query, as_orma_query } from 'orma'

// as_orma_query doesn't do anything at runtime - it is only used so that typescript types work properly
const query = as_orma_query({
    users: {
        id: true,
        first_name: true,
    },
})

const validation_errors = validate_query(query, orma_schema)

const results = await orma_query(query, orma_schema, orma_sql_function)

// {
//     users: [{
//         id: 1,
//         first_name: 'Alice',
//     }, {
//         id: 2,
//         first_name: 'Bob',
//     }, ...]
// }
```

> ⚠️ If Orma queries are being exposed via a public API, it is extremely important that queries be validated with the validate_query function. This is because validation ensures that every element in the query is either from a known list of values (e.g. keywords, field and entity names) or properly sanitized (e.g. escaping in $where clauses). In other words, <b>queries that include user input and are not validated are vulnerable to SQL injection</b>.

## Structure

Orma queries are serializable JSON objects that represent sql queries and are used to fetch data from a database. Queries are made up of properties that:

1. Start with '$'. These are keywords and **will not** appear in the query response
2. Start with anything else. These are data props and **will** appear in the response

In the following example, users and posts entities exist in the database. The posts entity has a foreign key, user_id, which references users. Since there is only one foreign key, Orma automatically infers the correct foreign key for nesting.

<table>
<tr>
<th> Query </th> <th> Result </th>
</tr>
<tr>
<td>

```js
{
    users: {
        id: true,
        first_name: true,
        last_name: true,
        posts: {
            id: true,
            views: true
        },
    },
}
```

</td>
<td>
    
```js
{
    users: [{
        id: 1,
        first_name: 'Alice',
        last_name: 'Anderson',
        posts: [{ id: 10, views: 109 }]
    }, {
        id: 2,
        first_name: 'Bob',
        last_name: 'Brown',
        posts: [{ id: 20, views: 87 }]
    }]
}
```

</td>
</tr>
</table>

Nested queries like the one above are called subqueries. Subqueries can also be nested in reverse:

<table>
<tr>
<th> Query </th> <th> Result </th>
</tr>
<tr>
<td>

```js
{
    posts: {
        id: true,
        views: true,
        users: {
            id: true,
            first_name: true,
        }
    },
}
```

</td>
<td>
    
```js
{
    posts: [{
        id: 10, 
        views: 109,
        users: [{ id: 1, first_name: 'Alice', }]
    }, {
        id: 20, 
        views: 87,
        users: [{ id: 1, first_name: 'Bob', }]
    }]
}
```

</td>
</tr>
</table>

## Renaming

Recall that the JSON properties in the result must exactly match the JSON properties in the query. By changing their property names, fields and entities can be renamed in the response. Note the added $from keyword in the posts subquery, which tells orma where to fetch my_posts from (since my_posts is not an entity name):

<table>
<tr>
<th> Query </th> <th> Result </th>
</tr>
<tr>
<td>

```js
{
    users: {
        cool_id: 'id',
        first_name: true,
        my_posts: {
            $from: 'posts',
            id: true
        },
    },
}
```

</td>
<td>
    
```js
{
    users: [{
        cool_id: 1,
        first_name: 'Alice',
        my_posts: [{ id: 10 }]
    }]
}
```

</td>
</tr>
</table>

In some cases, Orma can't figure out the correct foreign key. For example, if the users entity has both a billing_address_id and shipping_address_id that reference an addresses entity, then Orma doesn't know which foreign key it should use. In this case the $foreign_key keyword can be used to choose one. Entity renaming can be used to allow multiple subqueries to fetch from the same entity. Note that $foreign_key should always be on the lower (more deeply nested) entity, which in this case is addresses:

<table>
<tr>
<th> Query </th> <th> Result </th>
</tr>
<tr>
<td>

```js
{
    users: {
        id: true,
        first_name: true,
        billing_addresses: {
            $foreign_key: ['billing_address_id'],
            $from: 'addresses',
            line_1: true
        },
        shipping_addresses: {
            $foreign_key: ['shipping_address_id'],
            $from: 'addresses',
            line_1: true
        }
    },
}
```

</td>
<td>
    
```js
{
    users: [{
        id: 1,
        first_name: 'Alice',
        billing_addresses: [{ line_1: '1 Test Road' }],
        shipping_addresses: [{ line_1: '2 Data Lane' }]
    }]
}
```

</td>
</tr>
</table>

## SQL functions

Orma supports the use of SQL functions. When using an SQL function a field name must be provided, for example:

<table><tr><th> Query </th> <th> Result </th></tr><tr><td>

```js
{
    users: {
        id: true,
        capitalized_first_name: {
            $upper: 'first_name'
        }
    },
}
```

</td><td>
    
```js
{
    users: [{
        id: 1,
        capitalized_first_name: 'ALICE'
    }]
}
```

</td></tr></table>

A full list of currently supported functions can be found in the sql_function_definitions variable in the [source code](src/query/json_sql.ts).

## Pagination

Pagination is done though the $limit and $offset keywords, which work the same way as LIMIT and OFFSET in SQL. This example will return only 1 record, starting from the second user:

<table>
<tr>
<th> Query </th> <th> Result </th>
</tr>
<tr>
<td>

```js
{
    users: {
        id: true,
        first_name: true,
        $limit: 1,
        $offset: 1
    },
}
```

</td>
<td>
    
```js
{
    users: [{
        id: 1,
        first_name: 'Bob'
    }]
}
```

</td>
</tr>
</table>

> ⚠️ because Orma batches SELECT statements, pagination on subqueries apply globally, rather than once per record. For example, the following query will fetch one post for <b>all</b> users, as opposed to the expected one post <b>per</b> user.

<table><tr><th> Query </th> <th> Result </th></tr><tr><td>

```js
{
    users: {
        id: true,
        first_name: true,
        posts: {
            id: true,
            $limit: 1
        }
    },
}
```

</td><td>
    
```js
{
    users: [{
        id: 1,
        first_name: 'Alice',
        posts: [{ id: 1 }]
    }, {
        id: 2,
        first_name: 'Bob'
        // Even though Bob has posts, 
        // they are not fetched because 
        // 1 post was already fetched for Alice
    }]
}
```

</td></tr></table>

## Filtering

Results can be filtered using the $where keyword. The following example returns users with the name 'Alice', notice the use of the $escape keyword, which tells Orma to interpret 'Alice' as a string instead of a field name. Specifically, $escape wraps the value in quotes (if it is a string) and escapes any unsafe SQL characters, such as quotes ('):

<table><tr><th> Query </th> <th> Result </th></tr><tr><td>

```js
{
    users: {
        id: true,
        first_name: true,
        $where: {
            $eq: ['first_name', {
                $escape: 'Alice'
            }]
        }
    },
}
```

</td><td>
    
```js
{
    users: [{
        id: 1,
        first_name: 'Alice'
    }]
}
```

</td></tr></table>

### Basic operations

The following SQL operations are available:

<table><tr><th> $where clause </th> <th> Generated SQL </th></tr>
<tr><td>

```js
$eq: ['column_1', 'column_2']
```

</td><td>
    
```sql
column_1 = column_2
```

</td></tr>
<tr><td>

```js
$eq: ['column_1', { $escape: null }]
```

</td><td>
    
```sql
column_1 IS NULL
```

</td></tr>
<tr><td>

```js
$gt: ['column_1', 'column_2']
```

</td><td>
    
```sql
column_1 > column_2
```

</td></tr>
<tr><td>

```js
$lt: ['column_1', 'column_2']
```

</td><td>
    
```sql
column_1 < column_2
```

</td></tr>
<tr><td>

```js
$gte: ['column_1', 'column_2']
```

</td><td>
    
```sql
column_1 >= column_2
```

</td></tr>
<tr><td>

```js
$lte: ['column_1', 'column_2']
```

</td><td>
    
```sql
column_1 <= column_2
```

</td></tr>
<tr><td>

```js
$like: ['column_1', { $escape: '%search_phrase%' }]
```

</td><td>
    
```sql
column_1 LIKE '%search_phrase%'
```

</td></tr>
<tr><td>

```js
$in: ['column_1', { $escape: [1, 2] }]
```

</td><td>
    
```sql
column_1 IN (1, 2)
```

</td></tr>
<tr><td>

```js
// $not works with most other search keywords. For example:
$not: {
    $eq: ['column_1', 'column_2']
}
```

</td><td>
    
```sql
column_1 != column_2
```

</td></tr>
<tr><td>

```js
// $not works with most other search keywords. For example:
$not: {
    $in: ['column_1', { $escape: [1, 2] }]
}
```

</td><td>
    
```sql
column_1 NOT IN (1, 2)
```

</td></tr>
<tr><td>

```js
// $not works with most other search keywords. For example:
$not: {
    $gt: ['column_1', 'column_2']
}
```

</td><td>
    
```sql
column_1 <= column_2
```

</td></tr>
</table>

### Connectives

The $and and $or keywords can be used to combine multiple $where clauses together, and can be nested to achieve complex filtering. For example, the following query will fetch all users who either have a first name starting with 'B' or are named Alice Anderson:

<table><tr><th> Query </th><th> Generated SQL </th></tr><tr><td>

```js
{
    users: {
        first_name: true,
        $where: {
            $or: [{
                $and: [{
                    $eq: ['first_name', { $escape: 'Alice'}]
                }, {
                    $eq: ['last_name', { $escape: 'Anderson'}]
                }]
            }, {
                $like: ['first_name', { $escape: 'B%' }]
            }]
        }
    },
}
```

</td><td>
    
```sql
SELECT first_name FROM users
WHERE (first_name = 'Alice' AND last_name = 'Anderson') OR (first_name LIKE 'B%')
```

</td></tr></table>

### $any_path

Sometimes you want to search for some record based on the existence of some other record. For example, we can find all users who had at least one of their posts commented on by the user 'Bob'. Including data from the posts and comments entities is not necessary for $any_path to work - it is only done here for demonstration purposes:

<table><tr><th> Query </th> <th> Result </th><th> Generated SQL (for users) </th></tr><tr><td>

```js
{
    users: {
        first_name: true,
        posts: {
            id: true,
            comments: {
                body: true,
                users: {
                    first_name: true
                }
            }
        },
        $where: {
            $any_path: [['posts', 'comments', 'users'], {
                // The second argument of $any_path is the same 
                // as a $where clause of the last entity in the 
                // path, in this case a $where clause on 'users'
                $eq: ['first_name', { $escape: 'Bob' }]
            }]
        }
    },
}
```

</td><td>
    
```js
{
    // only Alice's user is returned, since only Alice 
    // has a post that was commented on by Bob
    users: [{
        first_name: 'Alice',
        posts: [{ 
            id: 1,
            comments: [{
                body: 'Interesting post Alice!',
                users: [{
                    first_name: 'Bob'
                }]
            }]
        }]
    }]
}
```

</td><td>
    
```sql
SELECT first_name 
FROM users 
WHERE id IN (
    SELECT user_id 
    FROM posts 
    WHERE id IN (
        SELECT post_id 
        FROM comments 
        WHERE user_id IN (
            SELECT id 
            FROM users 
            WHERE first_name = 'Bob'
        )
    )
)
```

</td></tr></table>

### Subqueries in $where clauses

Like in regular SQL, Orma allows subqueries inside where clauses. Although these are more verbose than $any_path, they provide more control over the $where clause:

<table><tr><th> Query </th> <th> Result </th><th> Generated SQL (for users) </th></tr><tr><td>

```js
{
    users: {
        first_name: true,
        posts: {
            id: true
        },
        $where: {
            $in: ['id', {
                $select: ['user_id'],
                $from: 'posts',
                $where: {
                    $eq: ['id', { $escape: 1}]
                }
            }]
        }
    },
}
```

</td><td>
    
```js
{
    // The user that has a post with id 1 
    // is returned (Alice in this case)
    users: [{
        first_name: 'Alice',
        posts: [{ 
            id: 1,
        }]
    }]
}
```

</td><td>
    
```sql
SELECT first_name 
FROM users 
WHERE id IN (
    SELECT user_id 
    FROM posts 
    WHERE id = 1
)
```

</td></tr></table>

### Referencing fields

As seen in previous examples, operations can be done to compare columns, just like with raw SQL. In cases where both an entity name and a field name must be given, the $entity $field syntax can be used. This can be useful when using a subquery inside a $where clause:

<table><tr><th> Query </th> <th> Generated SQL </th></tr>
<tr><td>

```js
{
    $eq: ['first_name', 'last_name']
}
```

</td><td>
    
```sql
first_name = last_name
```

</td></tr>
<tr><td>

```js
{
    $eq: [
        'first_name',
        {
            $entity: 'posts',
            $field: 'id',
        },
    ]
}
```

</td><td>
    
```sql
first_name = posts.id
```

</td></tr>
</table>

## Grouping and ordering

The $group_by and $order_by keywords work the same as GROUP BY and ORDER BY in SQL. Ordering can be done using $asc or $desc. $group_by can be used with aggregate functions such as $sum. For example:

<table><tr><th> Query </th> <th> Result </th></tr>
<tr><td>

```js
{
    users: {
        id: true,
        $order_by: [{ $desc: 'id' }]
    }
}
```

</td><td>
    
```js
{
    users: [{
        id: 2
    }, {
        id: 1
    }]
}
```

</td></tr>
<tr><td>

```js
{
    posts: {
        user_id: true,
        total_views: {
            $sum: 'views'
        },
        $group_by: ['user_id']
    }
}
```

</td><td>
    
```js
{
    posts: [{
        user_id: 1,
        total_views: 152
    }, {
        user_id: 2,
        total_views: 439
    }]
}
```

</td></tr>
</table>

## $select and $as

The $select syntax can be used as an alternative to regular subqueries. The main difference is that $select is run in the same query as opposed to a subquery which is run as a separate SELECT statement. For example:

<table><tr><th> Query </th> <th> Result </th> <th> Generated SQL </th></tr>
<tr><td>

```js
{
    posts: {
        id: true,
        users: {
            first_name: true
        }
    }
}
```

</td><td>
    
```js
{
    posts: [{
        id: 10,
        users: [{
            first_name: 'Alice'
        }]
    }]
}
```

</td><td>
    
```sql
SELECT id 
FROM users;

SELECT user_id, first_name 
FROM posts
```

</td></tr>
<tr><td>

```js
{
    posts: {
        id: true,
        $select: [{
            $as: [{
                $select: ['first_name'],
                $from: 'users',
                $where: {
                    $eq: ['id', {
                        $entity: 'posts',
                        $field: 'user_id'
                    }]
                }
            }, 'user_first_name']
        }]
    }
}
```

</td><td>
    
```js
{
    posts: [{
        id: 10,
        user_first_name: 'Alice'
    }]
}
```

</td><td>
    
```sql
SELECT id, (
    SELECT first_name 
    FROM users 
    WHERE id = posts.user_id
) AS user_first_name
FROM posts
```

</td></tr>
</table>

> ⚠️ $select and $as currently do not provide types on the query result, but are otherwise fully supported.

# Mutations

Mutations provide a way to modify data through three $operations: create, update and delete.

## Mutation diffs

The simplest way to generate a mutation is by fetching data, modifying it and using Orma's get_mutation_diff function to automatically generate a mutation. The clone() function in this example is a deep clone, which can be found in most utility libraries such as [lodash](https://lodash.com/docs/4.17.15#cloneDeep) or [ramda](https://ramdajs.com/docs/#clone):

```js
import { get_mutation_diff, orma_query, orma_mutate } from 'orma'

const query = {
    users: {
        // selecting the id field is required for mutation diffs to work
        id: true, 
        first_name: true,
        last_name: true,
    },
}

const original = await orma_query(query, orma_schema, orma_sql_function)
// {
//     users: [{
//         id: 1,
//         first_name: 'Alice',
//         last_name: 'Anderson'
//     }]
// }

const modified = clone(original)
modified.users[0].last_name = 'Smith'

const mutation_diff = get_mutation_diff(original, modified)
// mutation_diff is
// {
//     users: [{
//         $operation: 'update',
//         id: 1,
//         last_name: 'Smith'
//     }]
// }

await orma_mutate(mutation_diff, orma_sql_function, orma_schema)

// Now Alice's last_name is 'Smith'
```

To create or add data this way, simply add a record to the users array (with no id field) or delete a user (using javascript's .splice() method). Additionally, get_mutation_diff can handle creating, updating, or deleteing nested entities, or even adding new entities that were not in the original data.

> ⚠️ get_mutation_diff only works with entities that have a single-field primary key named '**id**' selected in the query.

## Operations

Mutations can also be created by specifying the $operations directly. Multiple operations can be used in the same mutation. For example:

<table><tr><th> Mutation </th> <th> Effect </th></tr>
<tr><td>

```js
{
    users: [{
        $operation: 'create',
        first_name: 'Alice',
        last_name: 'Anderson',
        email: 'aa@a.com'
    }]
}
```

</td><td>
Creates a new user. The id column is not provided since it is generated by the database.
</td></tr>
<tr><td>

```js
{
    users: [
        {
            $operation: 'update',
            id: 1,
            last_name: 'Smith',
        },
        {
            $operation: 'delete',
            id: 2,
        },
    ]
}
```

</td><td>
Update the user with id 1 (Alice) to have last_name 'Smith' <b>and</b> delete the user with id 2 (Bob).

</td></tr>
<tr><td>

```js
{
    users: [
        {
            $operation: 'create',
            first_name: 'Charlie',
            last_name: 'Coal',
            email: 'char@coal.com',
            posts: [{
                title: 'First post'
            }]
        }
    ]
}
```

</td><td>
Create a new user for Charlie, then create a post. Orma will automatically set the user_id of this post to whatever id the database generated for Charlie. This works because there is only one foreign key (user_id) connecting the users and posts tables.

</td></tr>
</table>

Notice that in the last example, we did not need a $operation on the post - Orma inferred that this is a create through [operation cascading](#operation-cascading).

## Operation cascading

It can be cumbersome to write an operation on each record (especially when creating mutations by hand), which is why Orma provides operation cascading. This means that a record with no $operation will inherit an operation from the closest ancestor record above it. A root operation can be provided to cascade onto top-level records (besides for cascading, root operations don't do anything). For example:

```js
{
    $operation: 'update',
    users: [{
        // $operation: 'update' is inherited
        id: 1,
        last_name: 'Smith',
        posts: [{
            // $operation: 'update' is inherited
            id: 2,
            views: 123
        }, {
            // operation cascading is overriden by explicitly 
            // setting the operation to be create. Any records 
            // nested under this one will be inferred as a create, 
            // rather than an update
            $operation: 'create',
            title: 'My post'
        }]
    }]
}
```

## Record identifiers

When updating or deleting, Orma will choose one or more fields to act as the **record identifier**. These fields determine which record in the database will be modified. The value of a record identifier will never be changed when updating a record. Orma will prioritize record identifiers based on whether a field is:
1. primary key(s)
2. unique field(s)

Primary keys or unique indexes with more than one field are supported. If the choice is ambiguous, then the mutation is invalid (for example, two fields belonging to different unique indexes are given, but no primary key is provided). Note that fields that have a $guid as their value are *not* considered when chosing a record identifier.

It is currently impossible to change a primary key via an Orma mutation, since primary keys are always chosen as record identifiers and record identifiers are not changed when updating.

<table><tr><th> Mutation piece </th> <th> Record identifiers </th><th> Fields that are updated </th></tr>
<tr><td>

```js
{
    $operation: 'update',
    id: 1,
    first_name: 'John',
    last_name: 'Smith'
}
```

</td><td>
id
</td>
</td><td>
first_name, last_name
</td></tr>
<tr><td>

```js
{
    $operation: 'update',
    id: 1,
    email: 'jonh@smith.com'
}
```

</td><td>
id
</td>
</td><td>
email
</td></tr>
<tr><td>

```js
{
    $operation: 'update',
    email: 'aa@a.com',
    first_name: 'John',
    last_name: 'Smith'
}
```

</td><td>
email
</td>
</td><td>
first_name, last_name
</td></tr>
</table>

## Creating in batch

All create operations are done in batches for efficiency. In other words, one CREATE statement can contain many records. To figure out which record was assigned which id by the database, Orma requires that the fields of at least one unique index are given in the mutation. For example:

<table><tr><th> Mutation piece </th> <th> Valid </th></tr>
<tr><td>

```js
{
    $operation: 'create',
    id: 1,
    first_name: 'John',
    last_name: 'Smith'
}
```

</td><td>
✅ Yes, primary key is provided
</td>
</td></tr>
<tr><td>

```js
{
    $operation: 'create',
    email: 'john@smith.com',
    first_name: 'John',
    last_name: 'Smith'
}
```

</td><td>
✅ Yes, unique field 'email' is provided
</td>
</td></tr>
<tr><td>

```js
{
    $operation: 'create',
    first_name: 'John',
    last_name: 'Smith'
}
```

</td><td>
❌ No, a unique field is not provided
</td>
</td></tr>
</table>

If an entity doesnt have a required unique field, a temporary_id field can be added to that entity in the database. In this example, temporary ids are randomly generated for the addresses entity using [nanoid](https://www.npmjs.com/package/nanoid):

```js
import {
    orma_mutate_prepare, 
    orma_mutate_run,
    mutation_path_to_entity
} from 'orma'

import { nanoid } from 'nanoid'

const mutation = { 
    $operation: 'update',
    addresses: { id: 1, line_1: '123 Road' }
}

const mutation_plan = orma_mutate_prepare(orma_schema, mutation)

mutation_plan.mutation_pieces.forEach(mutation_piece => {
    const operation = mutation_piece.record.$operation
    const entity = mutation_path_to_entity(mutation_piece.path)
    
    if (operation === 'create' && entity === 'addresses') {
        mutation_piece.record.temporary_id = nanoid()
    }
})

await orma_mutate_run(
    orma_schema,
    orma_sql_function,
    mutation_plan,
    mutation
)
```

In the previous example, orma_mutate_prepare and orma_mutate_run were used instead of orma_mutate, allowing custom behaviour to run between the logic and execution stages.

## Guids

When creating records, Orma automatically sets the value of foreign keys to be the same as the value of the corresponding primary key. The $guid keyword provides a way to customize this behaviour. If two fields have the same $guid, then Orma will ensure that they both end up with the same value in the database. This can be used to control foreign key propagation by giving a primary key and a foreign key the same $guid. This is useful in cases where Orma cannot automatically infer which foreign keys to use. 

In the first example, Orma cannot automatically propagate foreign keys, since the user and post records are not adjacent (one is not nested under the other).

In the second example, $guids specify which address is the billing address and which is the shipping address. Orma can't figure this out automatically, since there are two foreign keys to choose from: billing_address_id and shipping_address_id.


<table><tr><th> Mutation </th> <th> Created records </th></tr>
<tr><td>

```js
{
    $operation: 'create',
    users: [{
        id: { $guid: 'G79C' },
        first_name: 'Alice',
        last_name: 'Anderson',
        email: 'aa@a.com',
    }],
    posts: [{
        user_id: { $guid: 'G79C' },
        title: 'My post'
    }]
}
```

</td><td>

```js
{
    users: [{
        id: 1,
        first_name: 'Alice',
        last_name: 'Anderson',
        email: 'aa@a.com',
    }],
    posts: [{
        user_id: 1,
        title: 'My post'
    }]
}
```
</td></tr>
<tr><td>

```js
{
    $operation: 'create',
    users: [{
        billing_address_id: { $guid: 'G79C'},
        shipping_address_id: { $guid: 'Hz45' },
        first_name: 'Alice',
        last_name: 'Anderson',
        email: 'aa@a.com',
        addresses: [{
            id: { $guid: 'G79C'},
            line_1: '10 Test Road'
        }, {
            id: { $guid: 'Hz45' },
            line_2: '11 Data Lane'
        }]
    }]
}
```

</td><td>

```js
{
    users: [{
        id: 1,
        billing_address_id: 10,
        shipping_address_id: 11,
        first_name: 'Alice',
        last_name: 'Anderson',
        email: 'aa@a.com',
        addresses: [{
            id: 10,
            line_1: '10 Test Road'
        }, {
            id: 11,
            line_2: '11 Data Lane'
        }]
    }]
}
```
</td></tr>
</table>

> ⚠️ $guids can be any string or number. However, to avoid collisions between guids, it is recommended to use long random strings or data that is known to be unique.

# Multitenancy

## Connection edges
Orma supports [multitenancy](https://en.wikipedia.org/wiki/Multitenancy) using the concept of **connected records**. Records are connected if there is a path between them following a given list of **edges** (directed foreign keys). Orma provides a function to generate one edge per foreign key, from the foreign key to the referenced field. For most edges, this will be the desired behaviour.

```js
import { get_upwards_connection_edges } from 'orma'

const connection_edges = get_upwards_connection_edges(orma_schema)
```

To figure out which records are connected to a source record, we follow the connection edges. For example, say we wanted to find all the comments connected to the user with id 1, using the default connection edges generated above. We would first find all the connected posts (all the posts with user_id 1) and then find all the connected comments (all the comments with a post_id that references a connected post).

<table><tr><th> Distance from users </th> <th> Connected records </th></tr>
<tr><td>
0
</td><td>

```js
{
    users: [{
        id: 1
    }]
}
```
</td></tr>
<tr><td>
1
</td><td>

```js
{
    posts: [{
        id: 10,
        user_id: 1
    }, {
        id: 11,
        user_id: 1
    }]
}
```
</td></tr>
<tr><td>
2
</td><td>

```js
{
    comments: [{
        id: 100,
        post_id: 10
    }, {
        id: 101,
        post_id: 10
    }, {
        id: 110,
        post_id: 11
    }]
}
```
</td></tr>
</table>

All the users, posts and comments listed above are connected to the user with id 1.

With this in mind, Orma provides two main functions for dealing with connected edges. Given one or more source records:
1. The $where_connected keyword forces queries to only return connected records
2. The get_mutation_connected_errors function generates errors if anything in the mutation is not connected

Here is an example usage of each one:

```js
import { 
    orma_query, 
    orma_mutate_prepare, 
    get_mutation_connected_errors, 
    orma_mutate_run
} from 'orma'

// query example. Only addresses with the user_id 1 are returned
const results = await orma_query(
    { 
        $where_connected: [{
            $entity: 'users',
            $field: 'id',
            $values: [1]
        }],
        addresses: { id: true }
    },
    orma_schema,
    orma_sql_function,
    connection_edges
)

// mutation example. Since address 1 has the user_id 1, the mutation is valid and the errors array is empty
const mutation = { 
    $operation: 'update',
    addresses: { id: 1, line_1: '123 Road' }
}
const mutation_plan = orma_mutate_prepare(orma_schema, mutation)
const errors = await get_mutation_connected_errors(
    orma_schema,
    connection_edges,
    orma_sql_function,
    [
        {
            $entity: 'users',
            $field: 'id',
            $values: [1],
        },
    ],
    mutation_plan.mutation_pieces
)

if (connected_errors.length > 0) {
    // handle invalid mutation
}

await orma_mutate_run(
    orma_schema,
    orma_sql_function,
    mutation_plan,
    mutation
)
```

## Restricting $where_connected

To ensure a $where_connected is present, the restrict_where_connected function can be used. This function takes the maximal set of records that a query should have access to and a query. If any non-allowed records are in the query's $where_connected, an error will be generated. For example, imagine an admin has access to records connected to users 1 and 2:

```js
const maximal_where_connected = [{
    $entity: 'users',
    $field: 'id',
    $values: [1, 2] // has access to user 1 and 2
}]
```

Example where a valid $where_connected is provided

```js
const query = {
    $where_connected: [{
        $entity: 'users',
        $field: 'id',
        $values: [1] // the query wants records connected to user 1, which is a subset of 1 and 2, so it is valid
    }],
    addresses: { id: true }
}

// the errors array is empty
const errors = restrict_where_connected(query, maximal_where_connected)

if (errors.length > 0) {
    // handle invalid query
}
```

Example where no $where_connected is provided

```js
const query = {
    addresses: { id: true }
}

// since no $where_connected is provided in the query, there are no errors
const errors = restrict_where_connected(query, maximal_where_connected)

if (errors.length > 0) {
    // handle invalid query
}

// query.$where_connected is now equal to maximal_where_connected. If we ran the query, addresses connected to users 1 and 2 would be returned
```

> ⚠️ if no $where_connected is provided, restrict_where_connected will mutate the input query.

## Setting connection edges

Connection edges can be added, removed or reversed to cover more use cases. For example, imagine we wanted posts to be public, so that any user can query posts from any other user. We could do this by removing the connection edge between users and posts (we would ony pass the modified connection edges into the query function, so that users can't mutate posts from other users):

```js
import { get_upwards_connection_edges, remove_connection_edges } from 'orma'

const default_connection_edges = get_upwards_connection_edges(orma_schema)

const connection_edges = remove_connection_edges(default_connection_edges, [{
    from_entity: 'posts',
    from_field: 'user_id',
    to_entity: 'users',
    to_field: 'id'
}])
```

We can also reverse connection edges. For example, imagine we had a post_groupings table with each post having an optional post_grouping_id. By default, the connection edge would go from the post to the post grouping. This means that a post_grouping has no connection path to the users table, and so any user can edit any post grouping. If we want users to only have read / write access to post groupings that their posts are part of, we can reverse the connection edge:

```js
import { 
    get_upwards_connection_edges, 
    add_connection_edges, 
    remove_connection_edges, 
    Edge, 
    reverse_edges 
} from 'orma'

const default_connection_edges = get_upwards_connection_edges(orma_schema)

const add_edges: Edge[] = [
    {
        from_entity: 'post_groupings',
        from_field: 'id',
        to_entity: 'posts',
        to_field: 'post_grouping_id',
    }
]

const remove_edges: Edge[] = [
    // other edges can also be removed here
    ...add_edges.map(edge => reverse_edge(edge))
]

const connection_edges = add_connection_edges(
    remove_connection_edges(default_connection_edges, remove_edges),
    add_edges
)
```

# Advanced use cases

## Custom SQL

For internal use (as in not passing in data from a public API), Orma allows custom sql strings for features that do not yet have an Orma syntax. To do this, simply include an SQL string and skip validation:

```js
import { orma_query } from 'orma'

const results = await orma_query({
    users: {
        id: true,
        $where: "first_name = 'John' AND last_name = 'Smith'"
    }
})
```

> ⚠️ Custom SQL is provided as a last resort and is not well supported by Orma. Any custom SQL should be tested before use. Additionally, custom SQL will not always work well with other Orma features such as $where_connected.

# Other projects
These projects provide examples and tooling, however they are still being developed and documented
(biab)[https://www.npmjs.com/package/biab]
(orma-ui)[https://www.npmjs.com/package/orma-ui]
(orma_demo)[https://github.com/mendeljacks/orma_demo]

# Extra examples

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
