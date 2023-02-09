import {
    GlobalTestSchema,
    global_test_schema,
} from '../../helpers/tests/global_test_schema'
import { IsEqual } from '../helper_types'
import {
    FilterFieldsBySchemaProp,
    GetAllEdges,
    GetAllEntities,
    GetChildEdges,
    GetFieldIsRequired,
    GetFields,
    GetFieldsByRequired,
    GetFieldType,
    GetParentEdges,
} from './schema_helper_types'

{
    type test = GetAllEntities<typeof global_test_schema>

    const good: test = 'users'
    // @ts-expect-error
    const bad: test = 'pickle'
}

{
    type test = GetFields<typeof global_test_schema, 'users'>

    const good: test = 'id'
    // @ts-expect-error
    const bad1: test = 'not_a_field'
    // @ts-expect-error
    const bad2: test = '$indexes'
}

{
    type test = GetParentEdges<typeof global_test_schema, 'users'>

    const good1: test = {
        to_entity: 'addresses',
        from_field: 'billing_address_id',
    }

    // wrong entity
    const bad1: test = {
        // @ts-expect-error
        to_entity: 'products',
    }
}

{
    type test = GetChildEdges<typeof global_test_schema, 'users'>

    const good1: test = {
        to_entity: 'posts',
    }

    // wrong edge direction
    const bad1: test = {
        // @ts-expect-error
        to_entity: 'addresses',
    }
}

{
    type test = GetAllEdges<typeof global_test_schema, 'users'>

    // edge to child
    const good1: test = {
        to_entity: 'posts',
    }

    // edge to parent
    const good2: test = {
        to_entity: 'addresses',
        from_field: 'shipping_address_id',
    }

    // only allow edges from users
    const bad1: test = {
        //@ts-expect-error
        to_entity: 'comments',
    }
}

{
    type T = GetFieldType<typeof global_test_schema, 'users', 'id'>
    // reads the type from the schema
    const good: IsEqual<
        GetFieldType<typeof global_test_schema, 'users', 'id'>,
        number
    > = true

    // handles nullable
    const good2: IsEqual<
        GetFieldType<typeof global_test_schema, 'users', 'last_name'>,
        string | null
    > = true
}

{
    type T = GetFieldsByRequired<typeof global_test_schema, 'users', true>
    // gets regular required fields, but not auto increment fields. Ignores nullable fields
    const test1: IsEqual<T, 'email'> = true
}

{
    type T = GetFieldsByRequired<typeof global_test_schema, 'posts', true>
    // ignores fields with a default and foreign keys
    const test1: IsEqual<T, never> = true
}

// {
//     // finds fields with a schema prop and value
//     type T = FilterFieldsBySchemaProp<
//         typeof global_test_schema,
//         'users',
//         'not_null',
//         true
//     >
//     const expect: IsEqual<T, 'vendor_id' | 'location_id'> = true
// }

// {
//     // returns never if no field matches
//     type T = FilterFieldsBySchemaProp<
//         typeof global_test_schema,
//         'vendors',
//         'not_null',
//         true
//     >
//     const expect: IsEqual<T, never> = true
// }
