export type OrmaError = {
    message: string
    error_code?: string
    path?: (string | number)[]
    original_data?: any
    recommendation?: string
    additional_info?: Record<string, any>
    stack_trace?: any
}
