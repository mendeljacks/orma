import { orma_schema } from '../introspector/introspector'


export const verify_foreign_keys = async (mutation, mutation_path,  orma_schema: orma_schema) => {
    // this should probably be split into data collection (returns sql string) and checking (returns errors)
}