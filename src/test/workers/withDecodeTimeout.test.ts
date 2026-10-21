import { afterEach, describe, expect, it, vi } from 'vitest'
import { withDecodeTimeout } from '../../workers/withDecodeTimeout'

describe('withDecodeTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves the worker reply and clears the timeout', async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()

    await expect(
      withDecodeTimeout(Promise.resolve('decoded'), onTimeout, 50),
    ).resolves.toBe('decoded')

    await vi.advanceTimersByTimeAsync(50)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('rejects a pending reply with a useful timeout and terminates the worker', async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const pendingReply = new Promise<never>(() => {})
    const result = withDecodeTimeout(pendingReply, onTimeout, 125)

    const assertion = expect(result).rejects.toThrow(
      'Decoder worker timed out after 125ms',
    )
    await vi.advanceTimersByTimeAsync(125)

    await assertion
    expect(onTimeout).toHaveBeenCalledOnce()
  })
})
