import { AllowType, IsEqual } from './helper_types'
import {
    GetAllEdges,
    GetAllEntities,
    GetChildEdges,
    GetFields,
    GetFieldType,
    GetParentEdges,
    IsKeyword,
    IsStrictEqual,
    OrmaSchema,
} from './schema_types'

const getA = <K extends OrmaSchema>(a: K) => a

const test_schema = getA({
    products: {
        id: {
            data_type: 'string',
        },
        vendor_id: {
            references: {
                vendors: {
                    id: {},
                },
            },
        },
        location_id: {
            references: {
                locations: {
                    id: {},
                },
            },
        },
        name: {},
        $indexes: [],
    },
    vendors: {
        id: {},
    },
    images: {
        id: {},
        product_id: {
            references: {
                products: {
                    id: {},
                },
            },
        },
    },
    image_urls: {
        image_id: {
            references: {
                images: {
                    id: {},
                },
            },
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
        from_entity: 'products',
        from_field: 'vendor_id',
        to_entity: 'vendors',
        to_field: 'id',
    }

    const good2: test = {
        from_entity: 'products',
        from_field: 'location_id',
        to_entity: 'locations',
        to_field: 'id',
    }

    // wrong entity
    const bad1: test = {
        // @ts-expect-error
        from_entity: 'images',
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

    // missing from_entity
    // @ts-expect-error
    const bad3: test = {
        from_field: 'vendor_id',
        to_entity: 'vendors',
        to_field: 'id',
    }
}

{
    type test = GetChildEdges<typeof test_schema, 'products'>

    const good1: test = {
        from_entity: 'products',
        from_field: 'id',
        to_entity: 'images',
        to_field: 'product_id',
    }

    // wrong edge direction
    const bad1: test = {
        from_entity: 'images',
        // @ts-expect-error
        from_field: 'product_id',
        to_entity: 'products',
        // @ts-expect-error
        to_field: 'id',
    }

    type t1 = { [a: string]: 'hi' }
    type t2 = keyof t1
}

{
    type test = GetAllEdges<typeof test_schema, 'products'>

    // edge to child
    const good1: test = {
        from_entity: 'products',
        from_field: 'id',
        to_entity: 'images',
        to_field: 'product_id',
    }

    // edge to parent
    const good2: test = {
        from_entity: 'products',
        from_field: 'vendor_id',
        to_entity: 'vendors',
        to_field: 'id',
    }

    // only allow edges from products
    const bad1: test = {
        //@ts-expect-error
        from_entity: 'images',
        from_field: 'id',
        //@ts-expect-error
        to_entity: 'image_urls',
        //@ts-expect-error
        to_field: 'image_id',
    }

    type t1 = { [a: string]: 'hi' }
    type t2 = keyof t1
}

{
    // reads the type from the schema
    const good: IsEqual<
        GetFieldType<typeof test_schema, 'products', 'id'>,
        string
    > = true

    // unknown types are cast as any
    const good2: IsStrictEqual<
        GetFieldType<typeof test_schema, 'products', 'location_id'>,
        any
    > = true
}
