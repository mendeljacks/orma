import { GlobalTestMutation } from '../../test_data/global_test_schema'

const tests = () => {
    {
        // has root level tables
        const t: GlobalTestMutation = {
            $operation: 'create',
            posts: [],
            comments: [],
        }
    }
    {
        // disallow non tables
        const t: GlobalTestMutation = {
            $operation: 'create',
            // @ts-expect-error
            not_an_table: [],
        }
    }
    {
        // respects data type
        const t: GlobalTestMutation = {
            $operation: 'create',
            posts: [
                {
                    $operation: 'create',
                    name: '12',
                    //@ts-expect-error
                    id: 'hi', // data type of id is 'number', so this is not allowed
                },
            ],
        }
    }
    // check top level mutate
    // check first record needs op if no top level
    // check nested ops
    // check operation combos
    {
        // can have top level operation
        const t: GlobalTestMutation = {
            $operation: 'create',
            comments: [
                {
                    post_id: 12,
                },
            ],
        }
    }
    {
        // supports nesting with double map (not sure why, but double nested map can cause intellisense to fail)
        const t = {
            posts: [
                {
                    title: 'test',
                    likes: [].map(el => ({
                        posts: [].map(el => ({
                            
                        })),
                    })),
                },
            ],
        } as const satisfies GlobalTestMutation
    }
}
