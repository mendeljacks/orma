import { orma_field_schema, orma_schema } from '../introspector/introspector'
import { GetAllEntities, OrmaSchema } from '../types/schema_types'





export type Query<Schema extends OrmaSchema> = {
    [entity in GetAllEntities<Schema>]?: Subquery<Schema, entity>
}

export type Subquery<
    Schema extends OrmaSchema,
    EntityName extends GetAllEntities<Schema>
> = {
    [entity in ReferencedParent<Schema, EntityName>]?: Subquery<Schema, EntityName>
}

export type ReferencedParent<
    Schema extends OrmaSchema,
    EntityName extends GetAllEntities<Schema>
> = keyof Extract<
    Schema[EntityName][keyof Schema[EntityName]],
    { references: any }
>['references']

export type ReferencedChild<
    Schema extends OrmaSchema,
    EntityName extends GetAllEntities<Schema>
> = GetAllEntities<Schema>


