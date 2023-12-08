import { expect } from 'chai'
import { describe, test } from 'mocha'
import {
    register_integration_test,
    test_mutate,
    test_query
} from '../integration_tests/integration_setup.test'
import {
    GlobalTestQuery,
    GlobalTestSchema,
    global_test_schema
} from '../test_data/global_test_schema'
import { OrmaMutation } from '../types/mutation/mutation_types'
import { prepopulate } from './prepopulate'

describe('Prepopulate', () => {
    register_integration_test()

    test('Prepopulate without supercede', async () => {
        await delete_users()

        const schema = {
            ...global_test_schema,
            $entities: {
                ...global_test_schema.$entities,
                users: {
                    ...global_test_schema.$entities.users,
                    $prepopulate: {
                        supercede: false,
                        rows: [
                            {
                                id: 1,
                                first_name: 'John',
                                email: 'test'
                            },
                            {
                                id: 2,
                                first_name: 'Jane',
                                email: 'test2'
                            }
                        ] as NonNullable<
                            OrmaMutation<GlobalTestSchema>['users']
                        >
                    }
                }
            }
        }

        await prepopulate(test_query, test_mutate, schema)

        // Get users
        const result2 = await test_query({
            users: {
                id: true,
                first_name: true
            }
        } as const satisfies GlobalTestQuery)

        expect(result2.users?.length).to.equal(3)
    })
    test('Prepopulate with supercede', async () => {
        await delete_users()

        const schema = {
            ...global_test_schema,
            $entities: {
                ...global_test_schema.$entities,
                users: {
                    ...global_test_schema.$entities.users,
                    $prepopulate: {
                        supercede: true,
                        rows: [
                            {
                                id: 1,
                                first_name: 'John',
                                email: 'test'
                            },
                            {
                                id: 2,
                                first_name: 'Jane',
                                email: 'test2'
                            }
                        ] as NonNullable<
                            OrmaMutation<GlobalTestSchema>['users']
                        >
                    }
                }
            }
        }

        await prepopulate(test_query, test_mutate, schema)

        // Get users
        const result2 = await test_query({
            users: {
                id: true
            }
        } as const satisfies GlobalTestQuery)

        expect(result2.users?.length).to.equal(2)
    })
    test('Can fail nicely', async () => {
        await delete_users()

        const schema = {
            ...global_test_schema,
            $entities: {
                ...global_test_schema.$entities,
                users: {
                    ...global_test_schema.$entities.users,
                    $prepopulate: {
                        supercede: true,
                        rows: [
                            {
                                id: 1,
                                first_name: 'John',
                                email: 'test'
                            },
                            {
                                id: 2,
                                first_name: 'Jane',
                                email: 'test'
                            }
                        ] as NonNullable<
                            OrmaMutation<GlobalTestSchema>['users']
                        >
                    }
                }
            }
        }

        try {
            await prepopulate(test_query, test_mutate, schema)
            expect(1).to.equal(2)
        } catch (error: any) {
            expect(error.length).to.equal(2)
        }
    })
    test('Can run multiple times', async () => {
        await delete_users()

        const schema = {
            ...global_test_schema,
            $entities: {
                ...global_test_schema.$entities,
                users: {
                    ...global_test_schema.$entities.users,
                    $prepopulate: {
                        supercede: true,
                        rows: [
                            {
                                id: 1,
                                first_name: 'John',
                                email: 'test'
                            },
                            {
                                id: 2,
                                first_name: 'Jane',
                                email: 'test3'
                            }
                        ] as NonNullable<
                            OrmaMutation<GlobalTestSchema>['users']
                        >
                    }
                }
            }
        }

        try {
            await prepopulate(test_query, test_mutate, schema)
            await prepopulate(test_query, test_mutate, schema)
        } catch (error: any) {
            expect(1).to.equal(2)
        }
    })
})

const delete_users = async () => {
    // Get users
    const result = await test_query({
        users: {
            id: true,
            $where: { $eq: ['id', { $escape: 1 }] }
        },
        posts: {
            id: true,
            user_id: true,
            comments: { id: true }
        }
    } as const satisfies GlobalTestQuery)

    // Delete users id 1 and also all posts to avoid fk constraint fail
    await test_mutate({
        $operation: 'delete',
        ...result
    })
}
