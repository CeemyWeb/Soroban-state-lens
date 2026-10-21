import { describe, expect, it, vi } from 'vitest'
import { runLedgerReadSmoke } from './ledger-read-smoke.mjs'

describe('ledger read smoke command', () => {
  it('sends named ledger key parameters and checks present, absent, and latest ledger', async () => {
    const rpcFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        result: {
          entries: [{ key: 'present-key', xdr: 'entry-xdr' }],
          latestLedger: 123,
        },
      }),
    })

    const result = await runLedgerReadSmoke(
      'https://rpc.example',
      'present-key',
      'absent-key',
      rpcFetch,
    )

    expect(JSON.parse(rpcFetch.mock.calls[0][1].body)).toMatchObject({
      method: 'getLedgerEntries',
      params: { keys: ['present-key', 'absent-key'] },
    })
    expect(result).toEqual({
      foundPresentKey: true,
      absentKeyNotFound: true,
      latestLedger: 123,
    })
  })

  it('fails nonzero-shaped on invalid-parameter RPC errors', async () => {
    const rpcFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32602, message: 'Invalid params' },
      }),
    })

    await expect(
      runLedgerReadSmoke(
        'https://rpc.example',
        'present-key',
        'absent-key',
        rpcFetch,
      ),
    ).rejects.toThrow('RPC Error (-32602): Invalid params')
  })
})
