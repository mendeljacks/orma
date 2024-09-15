import {
    global_test_schema,
    GlobalTestSchema
} from '../test_data/global_test_schema'
import { IsEqual } from '../types/helper_types'
import {
    GetAllEdges,
    GetAllTables,
    GetChildEdges,
    GetColumns,
    GetColumnType,
    GetParentEdges
} from './schema_helper_types'

{
    type test = GetAllTables<GlobalTestSchema>

    const good: test = 'users'
    // @ts-expect-error
    const bad: test = 'pickle'
}

{
    type test = GetColumns<GlobalTestSchema, 'users'>

    const good: test = 'id'
    // @ts-expect-error
    const bad1: test = 'not_a_column'
    // @ts-expect-error
    const bad2: test = '$indexes'
}

{
    type test = GetParentEdges<GlobalTestSchema, 'users'>

    type T = NonNullable<
        GlobalTestSchema['tables']['users']['foreign_keys']
    >[number]

    const good1: test = {
        to_table: 'addresses',
        from_columns: ['billing_address_id']
    }

    // wrong table
    const bad1: test = {
        // @ts-expect-error
        to_table: 'products'
    }
}

{
    type test = GetChildEdges<GlobalTestSchema, 'users'>

    type T = NonNullable<
        GlobalTestSchema['cache']
    >['reversed_foreign_keys']['users'][number]['from_columns']

    const good1: test = {
        from_columns: ['id'],
        to_table: 'posts'
    }

    // wrong edge direction
    const bad1: test = {
        // @ts-expect-error
        to_table: 'addresses'
    }
}

{
    type test = GetAllEdges<GlobalTestSchema, 'users'>

    // edge to child
    const good1: test = {
        from_columns: ['id'],
        to_table: 'posts'
    }

    // edge to parent
    const good2: test = {
        from_columns: ['shipping_address_id'],
        to_table: 'addresses'
    }

    // only allow edges from users
    const bad1: test = {
        //@ts-expect-error
        to_table: 'comments'
    }
}

{
    type T = GetColumnType<GlobalTestSchema, 'users', 'id'>
    // reads the type from the schema
    const good: IsEqual<
        GetColumnType<GlobalTestSchema, 'users', 'id'>,
        number
    > = true

    // handles nullable
    const good2: IsEqual<
        GetColumnType<GlobalTestSchema, 'users', 'last_name'>,
        string | null
    > = true
}

{
    // handles enum type
    const expect: IsEqual<
        GetColumnType<GlobalTestSchema, 'tax_codes', 'tax_code'>,
        'TAX1' | 'TAX2' | 'TAX3'
    > = true
}
