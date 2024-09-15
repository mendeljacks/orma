import { OrmaSchema } from '../../schema/schema_types'

export const serialize_query = <Schema extends OrmaSchema>(
    query_ast: QueryAst<Schema>
) => {}

type QueryAst<Schema extends OrmaSchema> = {
    select: {}
}
