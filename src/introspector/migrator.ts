import { lir_join } from '../helpers/lir_join'
import { is_reserved_keyword } from '../helpers/schema_helpers'
import { orma_schema } from './introspector'

export const migrator = (
    target_schema: orma_schema,
    database_schema: orma_schema = {}
) => {
    const target_entities = Object.keys(target_schema).filter(
        key => !is_reserved_keyword(key)
    )
    const database_entities = Object.keys(database_schema).filter(
        key => !is_reserved_keyword(key)
    )

    const { left: target_only_entities, inner: both_entities, right: database_only_entities } =
        lir_join(
            target_entities,
            [],
            database_entities,
            el => el,
            (l, i, r) => [...i, l],
            el => el
        )

    
}
