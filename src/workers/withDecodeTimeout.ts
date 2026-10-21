import { normalizeTimeoutMs } from '../lib/rpc/normalizeTimeoutMs'

export const DEFAULT_DECODE_TIMEOUT_MS = 10_000

export function withDecodeTimeout<T>(
  request: Promise<T>,
  onTimeout: () => void,
  timeoutMs: number = DEFAULT_DECODE_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<T> {
  const normalizedTimeout = normalizeTimeoutMs(timeoutMs)

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      const timeoutMessage = `Decoder worker timed out after ${normalizedTimeout}ms`
      try {
        onTimeout()
        fail(new Error(timeoutMessage))
      } catch (error) {
        const terminationMessage =
          error instanceof Error ? error.message : String(error)
        fail(
          new Error(
            `${timeoutMessage}; failed to terminate worker: ${terminationMessage}`,
          ),
        )
      }
    }, normalizedTimeout)
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onAbort = () =>
      fail(signal?.reason ?? new Error('Decoder worker was terminated'))

    if (signal?.aborted) {
      onAbort()
      return
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(request).then(
      (value) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(value)
      },
      (error: unknown) => fail(error),
    )
  })
}
