type ErrorCode = 'validation_error' | 'ownership_error'

export type OrmaError = {
    message: string
    error_code?: ErrorCode
    path?: (string | number)[]
    original_data?: any
    recommendation?: string
    additional_info?: Record<string, any>
    stack_trace?: any
}
