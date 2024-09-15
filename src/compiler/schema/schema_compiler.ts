import { GetAllTables } from '../../schema/schema_helper_types'
import { OrmaSchema } from '../../schema/schema_types'
import { Path } from '../../types'
import { OrmaQueryAliases } from '../../types/query/query_types'
import { CreateStatement } from './schema_ast_types'

export const compile_create_statement = <
    Schema extends OrmaSchema,
    Aliases extends OrmaQueryAliases<Schema>,
    Table extends GetAllTables<Schema>
>({
    orma_schema,
    path,
    expression
}: {
    orma_schema: OrmaSchema
    path: Path
    expression: CreateStatement
}) => {
    
}
