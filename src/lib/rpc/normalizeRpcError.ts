import { isJsonRpcErrorResponse } from './isJsonRpcErrorResponse'

/**
 * Normalizes heterogeneous error sources into one app-safe structure.
 *
 * Handles:
 * - Standard Error objects
 * - Strings
 * - JSON-RPC 2.0 error responses
 * - Unknown/Empty inputs
 *
 * @param input - The error source to normalize.
 * @returns A normalized error object with code, message, and retryable flag.
 */
export function normalizeRpcError(input: unknown): {
  code: string
  message: string
  retryable: boolean
} {
  if (isJsonRpcErrorResponse(input)) {
    const { code, message } = input.error
    return {
      code: String(code),
      message: message || 'JSON-RPC Error',
      retryable: isRetryableJsonRpcCode(code),
    }
  }

  if (input instanceof Error) {
    const errorWithCode = input as Error & {
      code?: string | number
      retryable?: boolean
    }
    return {
      code:
        typeof errorWithCode.code === 'string' ||
        typeof errorWithCode.code === 'number'
          ? String(errorWithCode.code)
          : 'UNKNOWN',
      message: input.message || 'Unknown Error',
      retryable: errorWithCode.retryable === true,
    }
  }

  if (typeof input === 'string' && input.trim().length > 0) {
    return {
      code: 'UNKNOWN',
      message: input,
      retryable: false,
    }
  }

  if (input !== null && typeof input === 'object') {
    const candidate = input as Record<string, unknown>
    const message =
      typeof candidate.message === 'string' ? candidate.message : undefined
    const code =
      typeof candidate.code === 'string' || typeof candidate.code === 'number'
        ? String(candidate.code)
        : undefined
    const retryable =
      typeof candidate.retryable === 'boolean' ? candidate.retryable : false

    if (message || code) {
      return {
        code: code || 'UNKNOWN',
        message: message || 'Unknown Error',
        retryable,
      }
    }
  }

  return {
    code: 'UNKNOWN',
    message: 'Unknown Error',
    retryable: false,
  }
}

/**
 * Determines if a JSON-RPC error code is retryable.
 *
 * -32603: Internal error
 * -32000 to -32099: Server error (implementation-defined)
 */
function isRetryableJsonRpcCode(code: number): boolean {
  if (code === -32603) {
    return true
  }
  if (code >= -32099 && code <= -32000) {
    return true
  }
  return false
}
