import {
    as_orma_schema,
    generate_orma_schema_cache,
} from '../introspector/introspector'
import { AllowType, IsEqual } from './helper_types'
import {
    FilterFieldsBySchemaProp,
    GetAllEdges,
    GetAllEntities,
    GetChildEdges,
    GetFields,
    GetFieldType,
    GetParentEdges,
    IsKeyword,
} from './schema_types'

const test_schema = as_orma_schema({
    $entities: {
        products: {
            $fields: {
                id: { data_type: 'varchar' },
                vendor_id: { not_null: true },
                location_id: { not_null: true },
                name: {},
            },
            $database_type: 'mysql',
            $indexes: [],
            $foreign_keys: [
                {
                    from_field: 'vendor_id',
                    to_entity: 'vendors',
                    to_field: 'id',
                },
                {
                    from_field: 'location_id',
                    to_entity: 'locations',
                    to_field: 'id',
                },
            ],
        },
        vendors: { $fields: { id: {} }, $database_type: 'mysql' },
        images: {
            $fields: { id: {}, product_id: {} },
            $database_type: 'mysql',
            $foreign_keys: [
                {
                    from_field: 'product_id',
                    to_entity: 'products',
                    to_field: 'id',
                },
            ],
        },
        image_urls: {
            $fields: { image_id: {} },
            $database_type: 'mysql',
            $foreign_keys: [
                { from_field: 'image_id', to_entity: 'images', to_field: 'id' },
            ],
        },
        locations: {
            $database_type: 'mysql',
            $fields: { id: {} },
        },
    },
    $cache: {
        $reversed_foreign_keys: {
            vendors: [
                {
                    from_field: 'id',
                    to_entity: 'products',
                    to_field: 'vendor_id',
                },
            ],
            locations: [
                {
                    from_field: 'id',
                    to_entity: 'products',
                    to_field: 'location_id',
                },
            ],
            products: [
                {
                    from_field: 'id',
                    to_entity: 'images',
                    to_field: 'product_id',
                },
            ],
            images: [
                {
                    from_field: 'id',
                    to_entity: 'image_urls',
                    to_field: 'image_id',
                },
            ],
        },
    },
} as const)

{
    type good = AllowType<IsKeyword<'$a'>, true>
    // @ts-expect-error
    type bad = AllowType<IsKeyword<'a'>, true>
}

{
    type test = GetAllEntities<typeof test_schema>

    const good: test = 'products'
    // @ts-expect-error
    const bad: test = 'pickle'
}

{
    type test = GetFields<typeof test_schema, 'products'>

    const good: test = 'id'
    // @ts-expect-error
    const bad1: test = 'not_a_field'
    // @ts-expect-error
    const bad2: test = '$indexes'
}

{
    type test = GetParentEdges<typeof test_schema, 'products'>

    const good1: test = {
        from_field: 'vendor_id',
        to_entity: 'vendors',
        to_field: 'id',
    }

    const good2: test = {
        from_field: 'location_id',
        to_entity: 'locations',
        to_field: 'id',
    }

    // wrong entity
    const bad1: test = {
        // @ts-expect-error
        from_field: 'product_id',
        // @ts-expect-error
        to_entity: 'products',
        to_field: 'id',
    }

    // incorrect entity name
    const bad2: test = {
        from_entity: 'products',
        from_field: 'vendor_id',
        // @ts-expect-error
        to_entity: 'vendorss',
        to_field: 'id',
    }

    // // missing from_entity
    // // @ts-expect-error
    // const bad3: test = {
    //     from_field: 'vendor_id',
    //     to_entity: 'vendors',
    //     to_field: 'id',
    // }
}

{
    type test = GetChildEdges<typeof test_schema, 'products'>

    const good1: test = {
        from_field: 'id',
        to_entity: 'images',
        to_field: 'product_id',
    }

    // wrong edge direction
    const bad1: test = {
        // @ts-expect-error
        from_field: 'product_id',
        // @ts-expect-error
        to_entity: 'products',
        // @ts-expect-error
        to_field: 'id',
    }
}

{
    type test = GetAllEdges<typeof test_schema, 'products'>

    // edge to child
    const good1: test = {
        from_field: 'id',
        to_entity: 'images',
        to_field: 'product_id',
    }

    // edge to parent
    const good2: test = {
        from_field: 'vendor_id',
        to_entity: 'vendors',
        to_field: 'id',
    }

    // only allow edges from products
    const bad1: test = {
        from_field: 'id',
        //@ts-expect-error
        to_entity: 'image_urls',
        //@ts-expect-error
        to_field: 'image_id',
    }
}

{
    // reads the type from the schema
    const good: IsEqual<
        GetFieldType<typeof test_schema, 'products', 'id'>,
        string | null
    > = true

    // unknown types are cast as any
    const good2: IsEqual<
        GetFieldType<typeof test_schema, 'products', 'location_id'>,
        any
    > = true
}

{
    // finds fields with a schema prop and value
    type T = FilterFieldsBySchemaProp<
        typeof test_schema,
        'products',
        'not_null',
        true
    >
    const expect: IsEqual<T, 'vendor_id' | 'location_id'> = true
}

{
    // returns never if no field matches
    type T = FilterFieldsBySchemaProp<
        typeof test_schema,
        'vendors',
        'not_null',
        true
    >
    const expect: IsEqual<T, never> = true
}
