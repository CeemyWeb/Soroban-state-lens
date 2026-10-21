import { normalizeTimeoutMs } from '../lib/rpc/normalizeTimeoutMs'

export const DEFAULT_DECODE_TIMEOUT_MS = 10_000

export function withDecodeTimeout<T>(
  request: Promise<T>,
  onTimeout: () => void,
  timeoutMs: number = DEFAULT_DECODE_TIMEOUT_MS,
): Promise<T> {
  const normalizedTimeout = normalizeTimeoutMs(timeoutMs)

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutMessage = `Decoder worker timed out after ${normalizedTimeout}ms`
      try {
        onTimeout()
        reject(new Error(timeoutMessage))
      } catch (error) {
        const terminationMessage =
          error instanceof Error ? error.message : String(error)
        reject(
          new Error(
            `${timeoutMessage}; failed to terminate worker: ${terminationMessage}`,
          ),
        )
      }
    }, normalizedTimeout)

    Promise.resolve(request).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
