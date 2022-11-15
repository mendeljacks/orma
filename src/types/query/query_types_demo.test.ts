import { orma_query } from '../..'
import { OrmaError } from '../../helpers/error_handling'
import { as_orma_query } from '../../query/query'
import { QueryResult } from './query_result_types'
import { OrmaQuery } from './query_types'

const t = () => {
    const schema = {
        $entities: {
            products: {
                $fields: { id: { data_type: 'int' } },
                $database_type: 'mysql',
            },
            images: {
                $fields: { product_id: {}, url: { data_type: 'varchar' } },
                $database_type: 'mysql',
                $foreign_keys: [
                    {
                        from_field: 'product_id',
                        to_entity: 'products',
                        to_field: 'id',
                    },
                ],
            },
        },
        $cache: {
            $reversed_foreign_keys: {
                products: [
                    {
                        from_field: 'id',
                        to_entity: 'images',
                        to_field: 'product_id',
                    },
                ],
            },
        },
    } as const

    const q = <Query extends OrmaQuery<typeof schema>>(
        query: Query
    ): Promise<
        | (QueryResult<typeof schema, Query> & { $success: true })
        | { $success: false; errors: OrmaError[] }
    > => {
        const a: any = ''
        return a
    }

    const query = as_orma_query(schema, {
        my_products: {
            $from: 'products',
            id: true,
            images: {
                my_url: 'url',
            },
            // $order_by: [{
            //     $asc: 'id'
            // }],
            $group_by: ['id'],
        },
    })

    orma_query(query, schema, async () => ({} as any)).then(result => {
        result.my_products[0].id
        result.my_products[0].images[0].my_url
    })
}
