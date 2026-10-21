import { beforeEach, describe, expect, it, vi } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import { ContractLoadStatus } from '../../store/types'

function makeTemporaryLedgerKey(): string {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: xdr.ScAddress.scAddressTypeContract(Buffer.alloc(32)),
      key: xdr.ScVal.scvSymbol('temporary-item'),
      durability: xdr.ContractDataDurability.temporary(),
    }),
  ).toXDR('base64')
}

const mockGetLedgerEntries = vi.fn()
const mockDecodeScVal = vi.fn()
const mockCreateDecoderWorkerSafe = vi.fn(() =>
  Promise.resolve({
    decodeScVal: mockDecodeScVal,
    terminate: vi.fn(),
  }),
)

vi.mock('../../lib/network/getLedgerEntries', () => ({
  getLedgerEntries: mockGetLedgerEntries,
}))

vi.mock('../../workers/createDecoderWorkerSafe', () => ({
  createDecoderWorkerSafe: mockCreateDecoderWorkerSafe,
}))

describe('loadContract action', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetLedgerEntries.mockReset()
    mockDecodeScVal.mockReset()
    mockCreateDecoderWorkerSafe.mockClear()
  })

  it('loads, decodes, and stores entries on success', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()
    const temporaryKey = makeTemporaryLedgerKey()

    mockGetLedgerEntries.mockResolvedValue({
      entries: [
        {
          key: temporaryKey,
          xdr: 'xdr-1',
          lastModifiedLedgerSeq: 7,
          liveUntilLedgerSeq: 50,
        },
      ],
      latestLedger: 100,
    })

    mockDecodeScVal.mockResolvedValue({
      kind: 'primitive',
      path: [],
      scType: 'string',
      value: 'decoded',
      raw: { switch: 'ScvString', value: 'decoded' },
    })

    await useLensStore.getState().loadContract('C1', ['rpc-key-1'])

    const state = getStoreState()
    const loadedEntry = state.ledgerData[`C1::Other::${temporaryKey}`]
    expect(state.activeContractId).toBe('C1')
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(Object.keys(state.ledgerData)).toHaveLength(1)
    expect(loadedEntry.rawXdr).toBe('xdr-1')
    expect(loadedEntry.durability).toBe('Temporary')
    expect(loadedEntry.expired).toBe(true)
    expect(loadedEntry.value).toMatchObject({
      value: 'decoded',
    })
  })

  it('sets EMPTY when the load succeeds with no entries', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()

    mockGetLedgerEntries.mockResolvedValue({
      entries: [],
      latestLedger: 100,
    })
    mockDecodeScVal.mockResolvedValue({
      kind: 'primitive',
      path: [],
      scType: 'void',
      value: null,
      raw: { switch: 'ScvVoid' },
    })

    await useLensStore.getState().loadContract('C_EMPTY', ['rpc-key-empty'])

    const state = getStoreState()
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.EMPTY)
    expect(state.contractLoadError).toBeNull()
  })

  it('sets ERROR when load fails', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()

    mockGetLedgerEntries.mockRejectedValue(new Error('network failure'))

    await useLensStore.getState().loadContract('C_FAIL', ['rpc-key-fail'])

    const state = getStoreState()
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.ERROR)
    expect(state.contractLoadError).toBe('network failure')
  })

  it('keeps malformed XDR visible as a stable raw marker while decoding siblings', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()

    mockGetLedgerEntries.mockResolvedValue({
      entries: [
        { key: 'good-key', xdr: 'good-xdr', lastModifiedLedgerSeq: 5 },
        { key: 'bad-key', xdr: 'bad-xdr', lastModifiedLedgerSeq: 6 },
      ],
      latestLedger: 6,
    })

    mockDecodeScVal
      .mockResolvedValueOnce({
        kind: 'primitive',
        path: [],
        scType: 'string',
        value: 'decoded',
        raw: { switch: 'ScvString', value: 'decoded' },
      })
      .mockResolvedValueOnce({
        code: 'DECODE_FAILED',
        message: 'Failed to decode ScVal XDR: malformed',
      })

    await useLensStore.getState().loadContract('C_RAW', ['rpc-good', 'rpc-bad'])

    const state = getStoreState()
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(state.ledgerData['C_RAW::Other::good-key'].value).toEqual({
      kind: 'primitive',
      path: [],
      scType: 'string',
      value: 'decoded',
      raw: { switch: 'ScvString', value: 'decoded' },
    })
    expect(state.ledgerData['C_RAW::Other::bad-key'].value).toEqual({
      kind: 'raw-xdr',
      xdr: 'bad-xdr',
    })
  })

  it('ignores stale in-flight results and keeps newest response', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()

    let resolveFirst:
      | ((value: {
          entries: Array<{
            key: string
            xdr: string
            lastModifiedLedgerSeq?: number
          }>
          latestLedger: number
        }) => void)
      | undefined
    const firstPromise = new Promise<{
      entries: Array<{
        key: string
        xdr: string
        lastModifiedLedgerSeq?: number
      }>
      latestLedger: number
    }>((resolve) => {
      resolveFirst = resolve
    })

    mockGetLedgerEntries
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce({
        entries: [{ key: 'new-key', xdr: 'new-xdr', lastModifiedLedgerSeq: 2 }],
        latestLedger: 2,
      })

    mockDecodeScVal.mockResolvedValue({
      kind: 'primitive',
      path: [],
      scType: 'string',
      value: 'decoded',
      raw: { switch: 'ScvString', value: 'decoded' },
    })

    const firstCall = useLensStore.getState().loadContract('C_STALE', ['k1'])
    const secondCall = useLensStore.getState().loadContract('C_STALE', ['k2'])

    await secondCall

    if (resolveFirst) {
      resolveFirst({
        entries: [{ key: 'old-key', xdr: 'old-xdr', lastModifiedLedgerSeq: 1 }],
        latestLedger: 1,
      })
    }
    await firstCall

    const state = getStoreState()
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(state.ledgerData['C_STALE::Other::new-key'].rawXdr).toBe('new-xdr')
    expect(state.ledgerData['C_STALE::Other::old-key']).toBeUndefined()
  })

  it('ignores stale results that finish decoding after a newer request', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()

    let resolveFirstDecode: ((value: unknown) => void) | undefined
    const firstDecode = new Promise<unknown>((resolve) => {
      resolveFirstDecode = resolve
    })
    const firstWorker = {
      decodeScVal: vi.fn().mockReturnValue(firstDecode),
      terminate: vi.fn(),
    }
    const secondWorker = {
      decodeScVal: vi.fn().mockResolvedValue({
        kind: 'primitive',
        path: [],
        scType: 'string',
        value: 'new',
        raw: { switch: 'ScvString', value: 'new' },
      }),
      terminate: vi.fn(),
    }

    mockCreateDecoderWorkerSafe
      .mockImplementationOnce(() => Promise.resolve(firstWorker))
      .mockImplementationOnce(() => Promise.resolve(secondWorker))
    mockGetLedgerEntries
      .mockResolvedValueOnce({
        entries: [{ key: 'old-key', xdr: 'old-xdr', lastModifiedLedgerSeq: 1 }],
        latestLedger: 1,
      })
      .mockResolvedValueOnce({
        entries: [{ key: 'new-key', xdr: 'new-xdr', lastModifiedLedgerSeq: 2 }],
        latestLedger: 2,
      })

    const firstCall = useLensStore
      .getState()
      .loadContract('C_DECODE_STALE', ['old'])
    for (
      let attempt = 0;
      attempt < 10 && !firstWorker.decodeScVal.mock.calls.length;
      attempt += 1
    ) {
      await Promise.resolve()
    }

    const secondCall = useLensStore
      .getState()
      .loadContract('C_DECODE_STALE', ['new'])
    await secondCall
    resolveFirstDecode?.({
      kind: 'primitive',
      path: [],
      scType: 'string',
      value: 'old',
      raw: { switch: 'ScvString', value: 'old' },
    })
    await firstCall

    const state = getStoreState()
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(state.ledgerData['C_DECODE_STALE::Other::new-key'].rawXdr).toBe(
      'new-xdr',
    )
    expect(state.ledgerData['C_DECODE_STALE::Other::old-key']).toBeUndefined()
  })

  it('times out a pending decode, keeps raw XDR, and completes the load', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()
    vi.useFakeTimers()

    const timedOutWorker = {
      decodeScVal: vi.fn(() => new Promise<never>(() => {})),
      terminate: vi.fn(),
    }
    const freshWorker = {
      decodeScVal: vi.fn().mockResolvedValue({
        kind: 'primitive',
        path: [],
        scType: 'u32',
        value: 9,
        raw: { switch: 'ScvU32', value: 9 },
      }),
      terminate: vi.fn(),
    }

    mockCreateDecoderWorkerSafe
      .mockImplementationOnce(() => Promise.resolve(timedOutWorker))
      .mockImplementationOnce(() => Promise.resolve(freshWorker))
    mockGetLedgerEntries.mockResolvedValue({
      entries: [
        { key: 'stalled-key', xdr: 'stalled-xdr', lastModifiedLedgerSeq: 1 },
        { key: 'next-key', xdr: 'next-xdr', lastModifiedLedgerSeq: 2 },
      ],
      latestLedger: 2,
    })

    try {
      useLensStore.getState().setNetworkConfig({
        networkId: 'custom',
        networkPassphrase: 'Custom Network',
        rpcUrl: 'https://rpc.example.com',
      })
      useLensStore.getState().setContractSpec('OTHER', { retained: true })

      const loadPromise = useLensStore
        .getState()
        .loadContract('C_TIMEOUT', ['stalled', 'next'])
      for (
        let attempt = 0;
        attempt < 20 && !timedOutWorker.decodeScVal.mock.calls.length;
        attempt += 1
      ) {
        await Promise.resolve()
      }
      expect(timedOutWorker.decodeScVal).toHaveBeenCalledOnce()

      await vi.advanceTimersByTimeAsync(10_000)
      await loadPromise

      const state = getStoreState()
      expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
      expect(state.ledgerData['C_TIMEOUT::Other::stalled-key'].value).toEqual({
        kind: 'raw-xdr',
        xdr: 'stalled-xdr',
        reason: 'Decoder worker timed out after 10000ms',
      })
      expect(
        state.ledgerData['C_TIMEOUT::Other::next-key'].value,
      ).toMatchObject({ kind: 'primitive', scType: 'u32', value: 9 })
      expect(timedOutWorker.terminate).toHaveBeenCalledOnce()
      expect(freshWorker.terminate).toHaveBeenCalledOnce()
      expect(state.networkConfig.rpcUrl).toBe('https://rpc.example.com')
      expect(state.contractSpecs.OTHER).toEqual({ retained: true })
    } finally {
      vi.useRealTimers()
    }
  })

  it('recreates a worker after a failed reply and decodes the next entry', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()

    const failedWorker = {
      decodeScVal: vi.fn().mockRejectedValue(new Error('transport closed')),
      terminate: vi.fn(),
    }
    const freshWorker = {
      decodeScVal: vi.fn().mockResolvedValue({
        kind: 'primitive',
        path: [],
        scType: 'u32',
        value: 9,
        raw: { switch: 'ScvU32', value: 9 },
      }),
      terminate: vi.fn(),
    }

    mockCreateDecoderWorkerSafe
      .mockImplementationOnce(() => Promise.resolve(failedWorker))
      .mockImplementationOnce(() => Promise.resolve(freshWorker))
    mockGetLedgerEntries.mockResolvedValue({
      entries: [
        { key: 'failed-key', xdr: 'failed-xdr', lastModifiedLedgerSeq: 1 },
        { key: 'next-key', xdr: 'next-xdr', lastModifiedLedgerSeq: 2 },
      ],
      latestLedger: 2,
    })

    await useLensStore.getState().loadContract('C_RECOVER', ['failed', 'next'])

    const state = getStoreState()
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(state.ledgerData['C_RECOVER::Other::failed-key'].value).toEqual({
      kind: 'raw-xdr',
      xdr: 'failed-xdr',
      reason: 'Decoder worker communication failed: transport closed',
    })
    expect(state.ledgerData['C_RECOVER::Other::next-key'].value).toMatchObject({
      kind: 'primitive',
      scType: 'u32',
      value: 9,
    })
    expect(failedWorker.terminate).toHaveBeenCalledOnce()
    expect(freshWorker.terminate).toHaveBeenCalledOnce()
  })

  it('does not commit a timed-out decode after a newer load starts', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()
    vi.useFakeTimers()

    const pendingWorker = {
      decodeScVal: vi.fn(() => new Promise<never>(() => {})),
      terminate: vi.fn(),
    }
    const currentWorker = {
      decodeScVal: vi.fn().mockResolvedValue({
        kind: 'primitive',
        path: [],
        scType: 'u32',
        value: 99,
        raw: { switch: 'ScvU32', value: 99 },
      }),
      terminate: vi.fn(),
    }
    mockCreateDecoderWorkerSafe
      .mockImplementationOnce(() => Promise.resolve(pendingWorker))
      .mockImplementationOnce(() => Promise.resolve(currentWorker))
    mockGetLedgerEntries
      .mockResolvedValueOnce({
        entries: [{ key: 'stale-key', xdr: 'stale-xdr' }],
        latestLedger: 1,
      })
      .mockResolvedValueOnce({
        entries: [{ key: 'current-key', xdr: 'current-xdr' }],
        latestLedger: 2,
      })

    try {
      const staleLoad = useLensStore.getState().loadContract('C_OLD', ['old'])
      for (
        let attempt = 0;
        attempt < 20 && !pendingWorker.decodeScVal.mock.calls.length;
        attempt += 1
      ) {
        await Promise.resolve()
      }
      expect(pendingWorker.decodeScVal).toHaveBeenCalledOnce()

      await useLensStore.getState().loadContract('C_NEW', ['new'])
      expect(pendingWorker.terminate).toHaveBeenCalledOnce()

      await vi.advanceTimersByTimeAsync(10_000)
      await staleLoad

      const state = getStoreState()
      expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
      expect(state.activeContractId).toBe('C_NEW')
      expect(state.ledgerData['C_NEW::Other::current-key'].value).toMatchObject(
        { kind: 'primitive', value: 99 },
      )
      expect(state.ledgerData['C_OLD::Other::stale-key']).toBeUndefined()
      expect(currentWorker.terminate).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
