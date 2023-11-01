import {
    global_test_schema,
    GlobalTestSchema,
} from '../../test_data/global_test_schema'
import { IsEqual } from '../helper_types'
import {
    GetAllEdges,
    GetAllEntities,
    GetChildEdges,
    GetFields,
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
        from_field: 'id',
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
        from_field: 'id',
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
    // handles enum type
    const expect: IsEqual<
        GetFieldType<GlobalTestSchema, 'tax_codes', 'tax_code'>,
        'TAX1' | 'TAX2' | 'TAX3' | null
    > = true
}