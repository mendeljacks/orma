import { Edge } from '../../helpers/schema_helpers'
import { OrmaSchema } from '../../schema/schema_types'
import { MutationOperation, operation } from '../mutate'
import { is_column_updated_for_mutation_plan } from './mutation_batches'

/**
 * Each constraint is a case where some mutation piece has to be run before some other mutation piece.
 * For example, when creating a user and a post from that user, the user must be created before the
 * post. This would be covered by the first constraint.
 *
 * The constraint source refers to the record that needs to come first (in the previous example the source
 * would be the user), and the constraint target is the record that must be processed after the source
 * (in the example the target would be the post).
 *
 * The reason the source can be any function but the target is an object, is because the mutation planner
 * runs on each mutation piece as a postential source, and check each rule for that piece, so the source
 * filter can be any function. But to find targets, we need to use a lookup object for performance
 * reasons, so the target filter is limited by the format of the lookup object.
 */
export const mutation_plan_constraints: MutationPlanConstraint[] = [
    {
        /*
        example:
        {
            users: [{ 
                $operation: 'create', 
                email: 'aa@a.com', 
                posts: [{ 
                    $operation: 'create', 
                    title: 'Test'
                }] 
            }],
        }
        
        */
        source_filter: ({ record }) =>
            ['create', 'upsert'].includes(record.$operation),
        target_filter: {
            connection_type: 'child',
            operations: ['create', 'update', 'upsert'],
            foreign_key_filter: 'exact_match'
        }
    },
    {
        /*
        example:
        {
            posts: [{ 
                $operation: 'delete', 
                id: 1,
                user_id: 1,
            }]
            users: [{ 
                $operation: 'delete', 
                id: 1,
            }],
        }
        */
        source_filter: ({ record }) => ['delete'].includes(record.$operation),
        target_filter: {
            connection_type: 'parent',
            operations: ['delete'],
            foreign_key_filter: 'exact_match'
        }
    },
    {
        /*
        example:
        {
            users: [{ 
                $operation: 'update', 
                id: 1, 
                shipping_address_id: null 
            }],
            addresses: [{ 
                $operation: 'delete', 
                id: 2
            }]
        }
        */
        source_filter: ({ record }) =>
            ['update', 'upsert'].includes(record.$operation),
        target_filter: {
            connection_type: 'parent',
            operations: ['delete'],
            foreign_key_filter: 'no_match'
        }
    },
    {
        /*
        example:
        {
            users: [{ 
                $operation: 'update', 
                id: 1,
                email: 'aa@a.com',
                $identifying_columns: ['email']
            }],
            posts: [{ 
                $operation: 'create', 
                user_id: 1,
                title: 'test'
            }]
        }
        */
        source_filter: ({ orma_schema, table, edge, record }) =>
            ['update', 'upsert'].includes(record.$operation) &&
            is_column_updated_for_mutation_plan(
                orma_schema,
                table,
                edge.from_columns,
                record
            ),
        target_filter: {
            connection_type: 'child',
            operations: ['create', 'update', 'upsert'],
            foreign_key_filter: 'exact_match'
        }
    },
    {
        /*
        example:
        {
            posts: [{ 
                $operation: 'delete', 
                id: 1,
                user_id: 1,
            }]
            users: [{ 
                $operation: 'update', 
                id: 5,
                email: 'aa@a.com',
                $identifying_columns: ['email']
            }],
        }
        */
        source_filter: ({ record }) => ['delete'].includes(record.$operation),
        target_filter: {
            connection_type: 'parent',
            operations: ['update', 'upsert'],
            foreign_key_filter: 'no_match'
        }
    },
    {
        /*
        example:
        {
            categories: [{ 
                $operation: 'update', 
                $identifying_columns: ['label'],
                id: { $guid: 'a' },
                label: 'Root',
            }],
            post_has_categories: [{ 
                $operation: 'delete', 
                post_id: 1,
                category_id: { $guid: 'a' },
            }],
        }
        */
        source_filter: ({ record }) => ['update', 'upsert'].includes(record.$operation),
        target_filter: {
            connection_type: 'child',
            operations: ['delete'],
            foreign_key_filter: 'exact_match'
        }
    }
]

export type MutationPlanConstraint = {
    source_filter: (args: {
        record: Record<string, any> & {
            $operation: MutationOperation | 'upsert'
        }
        orma_schema: OrmaSchema
        table: string
        edge: Edge
    }) => boolean
    target_filter: {
        operations: (operation | 'upsert')[]
        connection_type: 'parent' | 'child'
        foreign_key_filter: 'exact_match' | 'no_match'
    }
}
