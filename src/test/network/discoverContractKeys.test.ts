import { afterEach, describe, expect, it, vi } from 'vitest'
import { StrKey } from '@stellar/stellar-sdk'
import { discoverContractKeys } from '../../lib/network/discoverContractKeys'

const contractId = StrKey.encodeContract(new Uint8Array(32))

const params = (signal: AbortSignal) => ({
  rpcUrl: 'https://rpc.example.test',
  networkPassphrase: 'Test Network',
  contractId,
  sourceAccount: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  functionName: 'read',
  args: ['hello'],
  signal,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('discoverContractKeys', () => {
  it('simulates a contract call and adapts the footprint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          jsonrpc: '2.0',
          id: 1,
          result: {
            latestLedger: 42,
            footprint: { readOnly: ['read-key'], readWrite: ['write-key'] },
          },
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await discoverContractKeys(
      params(new AbortController().signal),
    )

    expect(result.success).toBe(true)
    expect(result.latestLedger).toBe(42)
    expect(result.footprint).toEqual({
      readOnly: ['read-key'],
      readWrite: ['write-key'],
    })
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(request.method).toBe('simulateTransaction')
    expect(request.params[0].transaction).toEqual(expect.any(String))
  })

  it('maps JSON-RPC errors into a failed simulation result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32000, message: 'Simulation failed' },
          }),
      }),
    )

    const result = await discoverContractKeys(
      params(new AbortController().signal),
    )
    expect(result).toEqual({
      success: false,
      error: 'RPC Error (-32000): Simulation failed',
    })
  })

  it('preserves abort behavior', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      discoverContractKeys(params(controller.signal)),
    ).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
