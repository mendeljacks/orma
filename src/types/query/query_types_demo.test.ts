import { orma_query } from '../..'
import { as_orma_schema } from '../../introspector/introspector'
import { as_orma_query } from '../../query/query'

{
    const schema = as_orma_schema({
        products: {
            id: {
                data_type: 'number',
            },
        },
        images: {
            product_id: {
                references: {
                    products: {
                        id: {},
                    },
                },
            },
            url: {
                data_type: 'string',
            },
        },
    })

    const query = as_orma_query(schema, {
        // products: {
        //     id: true,
        //     images: {
        //         url: true,
        //     },
        // },
        my_products: {
            $from: 'products',
            id: true,
            images: {
                my_url: 'url',
            },
        },
    } as const)

    orma_query(
        query,
        schema,
        async () => ({} as any),
        () => {}
    ).then(result => {
        result.my_products[0].id
        result.my_products[0].images[0].my_url
    })
}