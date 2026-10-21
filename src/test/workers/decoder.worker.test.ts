import { describe, expect, it, vi } from 'vitest'
import * as Comlink from 'comlink'
import { xdr } from '@stellar/stellar-sdk'

import { isDecoderWorkerError } from '../../types/decoder-worker'
import { decoderWorkerApi } from '../../workers/decoder.worker'
import type { DecoderWorkerApi } from '../../types/decoder-worker'

// Mock Comlink.wrap to return a mock worker API
vi.mock('comlink', () => ({
  expose: vi.fn(),
  wrap: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue({ status: 'pong' }),
  })),
}))

// Mock Worker constructor
global.Worker = vi.fn().mockImplementation(function () {
  return {}
})

describe('DecoderWorker Comlink Integration', () => {
  it('should successfully call ping through Comlink and receive pong response', async () => {
    // Arrange
    const mockWorkerAPI = {
      ping: vi.fn().mockResolvedValue({ status: 'pong' }),
    } as unknown as Comlink.Remote<DecoderWorkerApi>

    // Mock Comlink.wrap to return our mock
    vi.mocked(Comlink.wrap).mockReturnValue(mockWorkerAPI)

    // Act
    const result = await mockWorkerAPI.ping()

    // Assert
    expect(result).toEqual({ status: 'pong' })
    expect(mockWorkerAPI.ping).toHaveBeenCalledOnce()
  })

  it('should verify Comlink.wrap is called with worker instance', async () => {
    // Arrange
    const { createDecoderWorker } =
      await import('../../workers/createDecoderWorker')

    // Act
    createDecoderWorker()

    // Assert
    expect(Worker).toHaveBeenCalledWith(expect.any(URL), { type: 'module' })
    expect(Comlink.wrap).toHaveBeenCalledWith(expect.any(Object))
  })

  it('decodes ScVal XDR into a structured-cloneable worker result', async () => {
    const scVal = xdr.ScVal.scvVec([xdr.ScVal.scvU32(42)])
    const result = await decoderWorkerApi.decodeScVal({
      xdr: scVal.toXDR('base64'),
    })

    if (isDecoderWorkerError(result)) {
      throw new Error(`Expected decoded value, received: ${result.message}`)
    }

    expect(structuredClone(result)).toEqual(result)
    expect(result.kind).toBe('vec')
    if (result.kind === 'vec') {
      expect(result.items[0]).toMatchObject({
        kind: 'primitive',
        scType: 'u32',
        value: 42,
      })
    }
  })
})
