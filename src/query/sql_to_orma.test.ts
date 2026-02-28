import { expect } from 'chai'
import { describe, test } from 'mocha'
import { sql_to_orma_query, sql_to_orma_mutation } from './sql_to_orma'

describe('sql_to_orma.ts', () => {
    describe('sql_to_orma_query', () => {
        test('converts simple SELECT', () => {
            const result = sql_to_orma_query('SELECT id, name FROM users')
            expect(result).to.deep.equal({
                users: {
                    id: true,
                    name: true,
                },
            })
        })

        test('converts SELECT *', () => {
            const result = sql_to_orma_query('SELECT * FROM users')
            expect(result.users.$select).to.deep.equal(['*'])
            expect(result.users.$from).to.be.undefined
        })

        test('converts SELECT with WHERE equality', () => {
            const result = sql_to_orma_query(
                "SELECT id, name FROM users WHERE id = 1"
            )
            expect(result.users.$where).to.deep.equal({
                $eq: ['id', { $escape: 1 }],
            })
        })

        test('converts SELECT with string WHERE', () => {
            const result = sql_to_orma_query(
                "SELECT id FROM users WHERE name = 'Alice'"
            )
            expect(result.users.$where).to.deep.equal({
                $eq: ['name', { $escape: 'Alice' }],
            })
        })

        test('converts SELECT with AND/OR', () => {
            const result = sql_to_orma_query(
                "SELECT id FROM users WHERE id = 1 AND name = 'Alice'"
            )
            expect(result.users.$where.$and).to.be.an('array')
            expect(result.users.$where.$and).to.have.length(2)
        })

        test('converts SELECT with OR', () => {
            const result = sql_to_orma_query(
                "SELECT id FROM users WHERE id = 1 OR id = 2"
            )
            expect(result.users.$where.$or).to.be.an('array')
        })

        test('converts SELECT with comparison operators', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users WHERE views > 100'
            )
            expect(result.users.$where).to.deep.equal({
                $gt: ['views', { $escape: 100 }],
            })
        })

        test('converts SELECT with >=', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users WHERE views >= 100'
            )
            expect(result.users.$where).to.deep.equal({
                $gte: ['views', { $escape: 100 }],
            })
        })

        test('converts SELECT with <', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users WHERE views < 50'
            )
            expect(result.users.$where).to.deep.equal({
                $lt: ['views', { $escape: 50 }],
            })
        })

        test('converts SELECT with <=', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users WHERE views <= 50'
            )
            expect(result.users.$where).to.deep.equal({
                $lte: ['views', { $escape: 50 }],
            })
        })

        test('converts SELECT with LIKE', () => {
            const result = sql_to_orma_query(
                "SELECT id FROM users WHERE name LIKE '%Alice%'"
            )
            expect(result.users.$where).to.deep.equal({
                $like: ['name', { $escape: '%Alice%' }],
            })
        })

        test('converts SELECT with IN list', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users WHERE id IN (1, 2, 3)'
            )
            expect(result.users.$where).to.deep.equal({
                $in: ['id', { $escape: [1, 2, 3] }],
            })
        })

        test('converts SELECT with NOT IN', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users WHERE id NOT IN (1, 2)'
            )
            expect(result.users.$where).to.deep.equal({
                $not: { $in: ['id', { $escape: [1, 2] }] },
            })
        })

        test('converts SELECT with IS NULL', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users WHERE name IS NULL'
            )
            expect(result.users.$where).to.deep.equal({
                $eq: ['name', { $escape: null }],
            })
        })

        test('converts SELECT with IS NOT NULL', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users WHERE name IS NOT NULL'
            )
            expect(result.users.$where).to.deep.equal({
                $not: { $eq: ['name', { $escape: null }] },
            })
        })

        test('converts SELECT with column alias', () => {
            const result = sql_to_orma_query(
                'SELECT id, first_name AS name FROM users'
            )
            expect(result.users.id).to.equal(true)
            expect(result.users.name).to.equal('first_name')
            expect(result.users.$from).to.be.undefined
        })

        test('converts SELECT with ORDER BY ASC', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users ORDER BY id ASC'
            )
            expect(result.users.$order_by).to.deep.equal([
                { $asc: 'id' },
            ])
        })

        test('converts SELECT with ORDER BY DESC', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users ORDER BY id DESC'
            )
            expect(result.users.$order_by).to.deep.equal([
                { $desc: 'id' },
            ])
        })

        test('converts SELECT with GROUP BY', () => {
            const result = sql_to_orma_query(
                'SELECT user_id, COUNT(*) FROM posts GROUP BY user_id'
            )
            expect(result.posts.$group_by).to.deep.equal(['user_id'])
        })

        test('converts SELECT with LIMIT', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users LIMIT 10'
            )
            expect(result.users.$limit).to.equal(10)
        })

        test('converts SELECT with LIMIT and OFFSET', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users LIMIT 10 OFFSET 20'
            )
            expect(result.users.$limit).to.equal(10)
            expect(result.users.$offset).to.equal(20)
        })

        test('converts SELECT with aggregate SUM', () => {
            const result = sql_to_orma_query(
                'SELECT SUM(views) AS total_views FROM posts'
            )
            // SUM is an aggregate, should be converted to $sum
            expect(result.posts.total_views).to.deep.equal({
                $sum: 'views',
            })
        })

        test('converts SELECT with COUNT(*)', () => {
            const result = sql_to_orma_query(
                'SELECT COUNT(*) AS total FROM users'
            )
            expect(result.users.total).to.deep.equal({
                $count: '*',
            })
        })

        test('converts SELECT with UPPER function', () => {
            const result = sql_to_orma_query(
                'SELECT UPPER(name) AS upper_name FROM users'
            )
            expect(result.users.upper_name).to.deep.equal({
                $upper: 'name',
            })
        })

        test('converts SELECT with LOWER function', () => {
            const result = sql_to_orma_query(
                'SELECT LOWER(name) AS lower_name FROM users'
            )
            expect(result.users.lower_name).to.deep.equal({
                $lower: 'name',
            })
        })

        test('converts SELECT with IN subquery', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users WHERE id IN (SELECT user_id FROM posts WHERE views > 100)'
            )
            expect(result.users.$where.$in).to.be.an('array')
            expect(result.users.$where.$in[0]).to.equal('id')
            // The subquery should be an orma subquery object
            const subquery = result.users.$where.$in[1]
            expect(subquery.$select).to.be.an('array')
            expect(subquery.$from).to.equal('posts')
        })

        test('converts SELECT with table.column reference', () => {
            const result = sql_to_orma_query(
                'SELECT users.id FROM users WHERE users.name = posts.name'
            )
            // The where should have $entity/$field references
            expect(result.users.$where.$eq[0]).to.deep.equal({
                $entity: 'users',
                $field: 'name',
            })
            expect(result.users.$where.$eq[1]).to.deep.equal({
                $entity: 'posts',
                $field: 'name',
            })
        })

        test('converts SELECT with != operator', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users WHERE id != 5'
            )
            expect(result.users.$where).to.deep.equal({
                $not: { $eq: ['id', { $escape: 5 }] },
            })
        })

        test('converts complex WHERE with nested AND/OR', () => {
            const result = sql_to_orma_query(
                "SELECT id FROM users WHERE (id = 1 OR id = 2) AND name = 'Alice'"
            )
            expect(result.users.$where.$and).to.be.an('array')
            // One branch should be $or, the other $eq
            const has_or = result.users.$where.$and.some(
                (clause: any) => clause.$or
            )
            expect(has_or).to.be.true
        })

        test('converts SELECT with HAVING', () => {
            const result = sql_to_orma_query(
                'SELECT user_id, COUNT(*) as cnt FROM posts GROUP BY user_id HAVING COUNT(*) > 5'
            )
            expect(result.posts.$having).to.exist
            expect(result.posts.$group_by).to.deep.equal(['user_id'])
        })

        test('throws on non-SELECT statement', () => {
            expect(() =>
                sql_to_orma_query('INSERT INTO users (name) VALUES (\'Alice\')')
            ).to.throw('only handles SELECT')
        })

        test('handles multiple ORDER BY columns', () => {
            const result = sql_to_orma_query(
                'SELECT id FROM users ORDER BY name ASC, id DESC'
            )
            expect(result.users.$order_by).to.deep.equal([
                { $asc: 'name' },
                { $desc: 'id' },
            ])
        })

        test('converts SELECT with COALESCE', () => {
            const result = sql_to_orma_query(
                "SELECT COALESCE(name, 'unknown') AS display_name FROM users"
            )
            expect(result.users.display_name).to.deep.equal({
                $coalesce: ['name', { $escape: 'unknown' }],
            })
        })

        test('converts SELECT with MIN/MAX', () => {
            const result = sql_to_orma_query(
                'SELECT MIN(views) AS min_views, MAX(views) AS max_views FROM posts'
            )
            expect(result.posts.min_views).to.deep.equal({ $min: 'views' })
            expect(result.posts.max_views).to.deep.equal({ $max: 'views' })
        })

        test('converts SELECT with AVG', () => {
            const result = sql_to_orma_query(
                'SELECT AVG(views) AS avg_views FROM posts'
            )
            expect(result.posts.avg_views).to.deep.equal({ $avg: 'views' })
        })
    })

    describe('sql_to_orma_mutation', () => {
        test('converts simple INSERT', () => {
            const result = sql_to_orma_mutation(
                "INSERT INTO users (first_name, email) VALUES ('Alice', 'a@a.com')"
            )
            expect(result).to.deep.equal({
                users: [
                    {
                        $operation: 'create',
                        first_name: 'Alice',
                        email: 'a@a.com',
                    },
                ],
            })
        })

        test('converts INSERT with numbers', () => {
            const result = sql_to_orma_mutation(
                'INSERT INTO posts (user_id, title, views) VALUES (1, \'Hello\', 100)'
            )
            expect(result.posts[0].$operation).to.equal('create')
            expect(result.posts[0].user_id).to.equal(1)
            expect(result.posts[0].title).to.equal('Hello')
            expect(result.posts[0].views).to.equal(100)
        })

        test('converts INSERT with multiple rows', () => {
            const result = sql_to_orma_mutation(
                "INSERT INTO users (name, email) VALUES ('Alice', 'a@a.com'), ('Bob', 'b@b.com')"
            )
            expect(result.users).to.have.length(2)
            expect(result.users[0].$operation).to.equal('create')
            expect(result.users[0].name).to.equal('Alice')
            expect(result.users[1].$operation).to.equal('create')
            expect(result.users[1].name).to.equal('Bob')
        })

        test('converts simple UPDATE', () => {
            const result = sql_to_orma_mutation(
                "UPDATE users SET first_name = 'Bob' WHERE id = 1"
            )
            expect(result).to.deep.equal({
                users: [
                    {
                        $operation: 'update',
                        first_name: 'Bob',
                        id: 1,
                    },
                ],
            })
        })

        test('converts UPDATE with multiple SET', () => {
            const result = sql_to_orma_mutation(
                "UPDATE users SET first_name = 'Bob', last_name = 'Smith' WHERE id = 1"
            )
            expect(result.users[0].$operation).to.equal('update')
            expect(result.users[0].first_name).to.equal('Bob')
            expect(result.users[0].last_name).to.equal('Smith')
            expect(result.users[0].id).to.equal(1)
        })

        test('converts simple DELETE', () => {
            const result = sql_to_orma_mutation(
                'DELETE FROM users WHERE id = 1'
            )
            expect(result).to.deep.equal({
                users: [
                    {
                        $operation: 'delete',
                        id: 1,
                    },
                ],
            })
        })

        test('converts DELETE with AND in WHERE', () => {
            const result = sql_to_orma_mutation(
                "DELETE FROM users WHERE id = 1 AND name = 'Alice'"
            )
            expect(result.users[0].$operation).to.equal('delete')
            expect(result.users[0].id).to.equal(1)
            expect(result.users[0].name).to.equal('Alice')
        })

        test('converts INSERT with NULL value', () => {
            const result = sql_to_orma_mutation(
                "INSERT INTO users (name, email) VALUES ('Alice', NULL)"
            )
            expect(result.users[0].name).to.equal('Alice')
            expect(result.users[0].email).to.be.null
        })

        test('throws on SELECT statement', () => {
            expect(() =>
                sql_to_orma_mutation('SELECT * FROM users')
            ).to.throw('only handles INSERT, UPDATE, DELETE')
        })

        test('converts UPDATE with numeric SET value', () => {
            const result = sql_to_orma_mutation(
                'UPDATE posts SET views = 100 WHERE id = 5'
            )
            expect(result.posts[0].$operation).to.equal('update')
            expect(result.posts[0].views).to.equal(100)
            expect(result.posts[0].id).to.equal(5)
        })
    })
})
