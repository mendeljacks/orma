# What is Orma?

Orma is a light-weight declarative ORM for SQL databases.

Orma makes it easy to use JSON based GraphQL style syntax to query and mutate existing databases.

Key Features

-   Powerful
    -   Mixed operations (create, update, delete in one request)
    -   Nested Queries and Mutations (automatic foreign key propogation)
    -   Powerful JSON query syntax with automatic typescript for queries and mutations
-   Portable
    -   Can run server-side or client-side (for sql-lite)
    -   BYO connection pool
-   Performant
    -   Batched insert statements.
    -   Multi stage query planning

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

## Database connector

Orma is not opinionated on database connectors, so feel free to use your favourite one. The examples here will use [mysql2](https://www.npmjs.com/package/mysql2). To use a different connector, a small wrapper may need to be written. This is relatively straightforward to implement, please check the [source code](src/helpers/database_adapters.ts) for details on what the wrapper needs to do.

Example setup:

```js
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

## Orma Schema

The orma schema is a JSON object that is required when making queries or mutations. The schema contains entity names, column names, as well as foreign key references and uniqness constraints and can be introspected directly by reading a live database or written manually. The schema is regular, serializable JSON, so it can be created dynamically at runtime, or fetched via an HTTP request. However, it is recommended to save the schema to disk so that Orma can provide intellisense through its Typescript types.

### Automatic Introspection

While Orma schemas can be hand-written, there is currently no way to populate a database with an orma schema. Instead, a schema can be introspected from an existing database which can be managed through other tools such as [db-migrate](https://www.npmjs.com/package/db-migrate). To get intellisense, the schema must be saved to a .ts file with 'as const' at the end.

The following is an example of a mysql database being introspected:

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

The generated schema JSON will look something like this:

```js
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

# Queries

## Setup

Queries are executed though the orma_query function:

```js
import { orma_query, validate_query } from 'orma'

const query = {
    users: {
        id: true,
        first_name: true,
    },
}

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

> ⚠️ If Orma is being exposed via a public-facing API, it is imperative that queries be validated with the validate_query function. This is because validation ensures that every element in the query is either from a known list of values (e.g. keywords, field and entity names) or properly sanitized (e.g. escaping in $where clauses). In other words, <b>queries that include user input and are not validated are vulnerable to SQL injection</b>.

## Structure

Orma queries are serializable JSON objects that represent sql queries and are used to fetch data from a database. Queries are made up of properties that:

1. Start with '$'. These are keywords and will not appear in the query response
2. Start with anything else. These are data props and will appear in the response

In the following example, users and posts entities exist. The posts entity has a foreign key, user_id, which references users. Since there is only one foreign key, Orma automatically infers the correct foreign key for nesting.

<table>
<tr>
<th> Query </th> <th> Response </th>
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
<th> Query </th> <th> Response </th>
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

Recall that the JSON properties in the result must exactly match the JSON properties in the query. By changing the property names in the query, fields and entities in the response can be renamed. Note the added $from keyword in the posts subquery, which tells orma which entity to fetch the posts from:

<table>
<tr>
<th> Query </th> <th> Response </th>
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

In some cases, Orma can't figure out the correct foreign key. For example, if the users entity has both a billing_address_id and shipping_address_id that reference an addresses entity, then nesting addresses onto users is ambiguous. In this case the $foreign_key keyword can be used to choose a foreign key, and the entities can be renamed so that they can both exist on the same result object. Note that $foreign_key should always be on the more deeply nested entity, in this case addresses.

<table>
<tr>
<th> Query </th> <th> Response </th>
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

## Pagination

Pagination is done though the $limit and $offset keywords, which work the same as in standard SQL. This example will return only 1 result, starting from the second record of users:

<table>
<tr>
<th> Query </th> <th> Response </th>
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

> ⚠️ because Orma fetches all data in batch, pagination on subqueries applies to ALL records for that subquery, as opposed to applying once per record in the higher query. For example, the following query will fetch one post for <b>all</b> users, as opposed to one post <b>per</b> user as you might expect.

<table><tr><th> Query </th> <th> Response </th></tr><tr><td>

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
        // Even though Bob has posts, they are not fetched because 1 post was already fetched for Alice
    }]
}
```

</td></tr></table>

## Filtering

Results can be filtered using the $where keyword. The following example returns users with the name 'Alice', notice the use of the $escape keyword, which tells Orma to interpret 'Alice' as a value instead of a field name. Specifically, $escape wraps the value in quotes (if it is a string) and escapes any unsafe SQL characters, such as ' characters:

<table><tr><th> Query </th> <th> Response </th></tr><tr><td>

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

### Filtering operations

Other filter operations are also available:

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
                $like: ['name', { $escape: 'B%' }]
            }]
        }
    },
}
```

</td><td>
    
```sql
SELECT first_name FROM users
WHERE (first_name = 'Alice' AND last_name = 'Anderson') OR (id LIKE 'B%')
```

</td></tr></table>

### Any path

Sometimes you want to search for some record based on the existence of some other record. For example, we can find all users who had at least one of their posts commented on by the user 'Bob'. Nesting posts and comments is not necessary for $any_path to work, and is only done here for demonstration purposes:

<table><tr><th> Query </th> <th> Response </th><th> Generated SQL (for users) </th></tr><tr><td>

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
                // this object is a $where clause on the 'users' entity, since 'users' is the last entity in the $any_path
                $eq: ['first_name', { $escape: 'Bob' }]
            }]
        }
    },
}
```

</td><td>
    
```js
{
    // only Alice's user is returned, since only Alice has a post that was commented on by Bob
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
SELECT first_name FROM users WHERE id IN (
    SELECT user_id FROM posts WHERE id IN (
        SELECT post_id FROM comments WHERE user_id IN (
            SELECT id FROM users WHERE first_name = 'Bob'
        )
    )
)
```

</td></tr></table>

### Subqueries in $where clauses

Like in regular SQL, Orma allows subqueries inside where clauses. These can be used instead of $any_path, to handle more complicated use cases - $any_path is simply a utility provided by Orma to generate a series of these nested subqueries:

<table><tr><th> Query </th> <th> Response </th><th> Generated SQL (for users) </th></tr><tr><td>

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
    // The user that has a post with id 1 is returned (Alice in this case)
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
SELECT first_name FROM users WHERE id IN (
    SELECT user_id FROM posts WHERE id = 1
)
```

</td></tr></table>

### Self reference

As seen in previous examples, operations can be done to compare columns, as they can be in raw SQL. In cases where both an entity name and a field name must be given, the $entity $field syntax can be used. This can be necessary if, for example, a field in a subquery should be equal to another field in the higher query.

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

# Mutations

Mutations provide a way to modify data through three $operations: create, update and delete.

## Mutation diffs

The simplest way to generate a mutation is by fetching data, modifying it and using Orma's get_mutation_diff function to automatically generate a mutation. The clone() function used is a deep clone, which can be found in most utility libraries such as [lodash](https://lodash.com/docs/4.17.15#cloneDeep) or [ramda](https://ramdajs.com/docs/#clone):

```js
import { get_mutation_diff, orma_query, orma_mutate } from 'orma'

const query = {
    users: {
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

To create or add data this way, simply add a record to the users array (with no id field) or delete a user (using javascript's .splice() method). Additionally, get_mutation_diff can handle creating, updating, or deleteing nested entities, or even adding new entities that were not in the original data (these will always be creates).

> ⚠️ get_mutation_diff only works with entities that have a single-field primary key named '**id**' selected in the query.

## Operations

Mutations can also be created using the $operation keyword. Operations can be combined to do multiple things in the same mutation. For example:

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
Creates a new user. In this case, the id column is generated by the database
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
Update the user with id 1 (Alice) to have last_name 'Smith' <b>and</b> delete the user with id 2 (Bob)

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
Create a new user for Charlie, and create a post. Orma will automatically set the user_id of this post to whatever id the database generated for Charlie. This works because there is only one foreign key (user_id) connecting the users and posts tables.

</td></tr>
</table>

Notice that in the last example, we did not need a $operation on the post - Orma inferred that this is a create through [operation cascading](#operation-cascading).

## Operation cascading

It can be cumbersome to write an operation on each record (especially when creating mutations by hand), which is why Orma provides operation cascading. This means that a record with no $operation will inherit an operation from the closest ancestor record above it. In addition to regular operations cascading, a root operation can be provided to cascade onto top-level records (besides for cascading, root operations don't do anything). For example:

```js
{
    $operation: 'update',
    users: [{
        // $operation is inherited as an 'update'
        id: 1,
        last_name: 'Smith',
        posts: [{
            // $operation is inherited as an 'update'
            id: 2,
            views: 123
        }, {
            // $operation cascading is overriden by providing an operation
            $operation: 'create',
            title: 'My post'
        }]
    }]
}
```

## Record identifiers

When updating or deleting, Orma will choose one or more fields to act as the **record identifier**. These fields determine which record in the database will be modified. In the case of updates, the value of record identifiers will never be changed. Record identifiers are chosen in this order:
1. primary key(s)
2. unique field(s)

Primary keys or unique indexes with more than one field are supported. If the choice is ambiguous, then the mutation is invalid (for example, two fields belonging to different unique indexes are given, but no primary key is provided). Note that fields that have a $guid as their value are *not* considered when chosing a record identifier.

Since primary keys are always chosen to be the record identifier if they are present, it is currently impossible to change a primary key via a mutation. 

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

## Guids

Just like foreign keys in queries, mutations rely on inference to automatically insert foreign keys when creating records. The $guid keyword provides a way to customize this behaviour by specifying that two or more fields should end up with the same value. This can be used to control foreign key insertion even in cases where there are multiple foreign keys or for records that are not adjacent in the mutation. 
In the first example, Orma cannot automatically infer a foreign key value, since the records are not nested together in the mutation.
In the second example, $guids are used to specify which address is the billing address and which one is the shipping address. Orma can't infer which foreign key to use automatically, since there are two foreign keys to choose from: billing_address_id and shipping_address_id.


<table><tr><th> Mutation </th> <th> Example created data </th></tr>
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

$guid values can be any strings or numbers. In these examples, a short random string was used to keep the examples simple. However, to avoid collisions between guids, it is recommended that a longer random string or some unique piece of data be used.







---

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
            $where: { $eq: ['country', { $escape: 'US' }] }, // <-- It is recommended to escape all user input to avoid SQL injection
        },
    },
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
        $where: { $any: ['addresses.country', { $escape: 'CA' }] },
    },
}

// Chaining multiple where clauses with and / or statements
const query = {
    users: {
        id: true,
        first_name: true,
        last_name: true,
        $where: {
            $and: [
                { $eq: ['first_name', { $escape: 'John' }] },
                { $eq: ['last_name', { $escape: 'Doe' }] },
            ],
        },
    },
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
    users: [
        {
            first_name: 'John',
            last_name: 'Doe',
        },
        {
            first_name: 'Jane',
            last_name: 'Smith',
        },
    ],
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
    users: [
        {
            $operation: 'create',
            first_name: 'John',
            last_name: 'Doe',
        },
        {
            $operation: 'delete',
            email: 'john@gmail.com',
        },
        {
            $operation: 'update',
            id: 123,
            last_name: 'Doe',
        },
    ],
}
```

# Additional features

-   Using {$guid: '...'} in two spots can be used to bypass circular dependencies in mutations (acts as a temporary identifier for the row)
-   Results of queries can always be passed directly to mutations with contents changed and it will work as expected.
-   Anypath and anyconnected can be used for row based multi-tenancy
- raw sql by skipping validation ($where: 'id = 1')

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
