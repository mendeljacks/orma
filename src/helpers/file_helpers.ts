import { existsSync, unlinkSync } from 'fs'

export const remove_file = (file_name: string) => {
    if (existsSync(file_name)) {
        unlinkSync(file_name)
    }
}