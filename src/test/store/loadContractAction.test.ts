import { beforeEach, describe, expect, it, vi } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import { ContractLoadStatus } from '../../store/types'
import { createContractDataLedgerEntry } from '../helpers/ledgerEntryFixtures'
import { makeContractDataFixture } from '../network/ledgerEntryFixtures'

import type { GetLedgerEntriesResult } from '../../lib/network/getLedgerEntries'

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
    const fixture = makeContractDataFixture(
      'temporary-key',
      xdr.ScVal.scvSymbol('decoded'),
      'temporary',
    )

    mockGetLedgerEntries.mockResolvedValue({
      entries: [
        {
          key: fixture.keyXdr,
          xdr: fixture.entryXdr,
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

    await useLensStore.getState().loadContract('C1', [fixture.keyXdr])

    const state = getStoreState()
    const loadedEntry = state.ledgerData[`C1::ContractData::${fixture.keyXdr}`]
    expect(state.activeContractId).toBe('C1')
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(Object.keys(state.ledgerData)).toHaveLength(1)
    expect(mockDecodeScVal).toHaveBeenCalledWith({ xdr: fixture.valueXdr })
    expect(loadedEntry.rawXdr).toBe(fixture.entryXdr)
    expect(loadedEntry.durability).toBe('Temporary')
    expect(loadedEntry.expired).toBe(true)
    expect(loadedEntry.value).toMatchObject({
      value: 'decoded',
    })
  })

  it('preserves demo records when directly loading the sample contract', async () => {
    const { SAMPLE_CONTRACT_ID } = await import('../../lib/demoContract')
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()
    const demoEntry = {
      key: 'sample-demo-entry',
      contractId: SAMPLE_CONTRACT_ID,
      type: 'ContractData' as const,
      value: 'demo value',
      lastModifiedLedger: 1,
    }
    useLensStore.getState().upsertLedgerEntry(demoEntry)
    await useLensStore.getState().loadContract(SAMPLE_CONTRACT_ID, [])

    expect(getStoreState().ledgerData[demoEntry.key]).toEqual(demoEntry)
    expect(getStoreState().contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(mockGetLedgerEntries).not.toHaveBeenCalled()
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

  it('replaces refreshed contract entries while preserving other contracts', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()
    const oldFixture = makeContractDataFixture('old-key')
    const otherFixture = makeContractDataFixture('other-key')
    const newFixture = makeContractDataFixture('new-key')

    mockGetLedgerEntries
      .mockResolvedValueOnce({
        entries: [{ key: oldFixture.keyXdr, xdr: oldFixture.entryXdr }],
        latestLedger: 1,
      })
      .mockResolvedValueOnce({
        entries: [{ key: otherFixture.keyXdr, xdr: otherFixture.entryXdr }],
        latestLedger: 2,
      })
      .mockResolvedValueOnce({
        entries: [{ key: newFixture.keyXdr, xdr: newFixture.entryXdr }],
        latestLedger: 3,
      })
    mockDecodeScVal.mockResolvedValue({
      kind: 'primitive',
      path: [],
      scType: 'string',
      value: 'decoded',
      raw: { switch: 'ScvString', value: 'decoded' },
    })

    await useLensStore.getState().loadContract('C1', [oldFixture.keyXdr])
    await useLensStore.getState().loadContract('C2', [otherFixture.keyXdr])
    await useLensStore.getState().loadContract('C1', [newFixture.keyXdr])

    const ledgerData = getStoreState().ledgerData
    expect(ledgerData[`C1::ContractData::${oldFixture.keyXdr}`]).toBeUndefined()
    expect(ledgerData[`C1::ContractData::${newFixture.keyXdr}`].rawXdr).toBe(
      newFixture.entryXdr,
    )
    expect(ledgerData[`C2::ContractData::${otherFixture.keyXdr}`].rawXdr).toBe(
      otherFixture.entryXdr,
    )
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
    expect(state.contractLoadErrorCode).toBeNull()
    expect(state.contractLoadAttemptCount).toBeNull()
  })

  it('preserves an RPC error code in contract load state', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()

    const error = Object.assign(new Error('RPC request failed'), {
      code: -32000,
    })
    mockGetLedgerEntries.mockRejectedValue(error)

    await useLensStore.getState().loadContract('C_RPC_FAIL', ['rpc-key'])

    const state = getStoreState()
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.ERROR)
    expect(state.contractLoadError).toBe('RPC request failed')
    expect(state.contractLoadErrorCode).toBe(-32000)
  })

  it.each([1, 3])(
    'stores the %i request attempt count on failure',
    async (attempts) => {
      const { resetStore, getStoreState, useLensStore } =
        await import('../../store/lensStore')
      resetStore()

      mockGetLedgerEntries.mockRejectedValue(
        Object.assign(new Error('network failure'), { attempts }),
      )

      await useLensStore.getState().loadContract('C_FAIL', ['rpc-key-fail'])

      const state = getStoreState()
      expect(state.contractLoadError).toBe('network failure')
      expect(state.contractLoadAttemptCount).toBe(attempts)
    },
  )

  it('keeps malformed XDR visible as a stable raw marker while decoding siblings', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()
    const goodFixture = makeContractDataFixture('good-key')
    const badFixture = makeContractDataFixture('bad-key')

    mockGetLedgerEntries.mockResolvedValue({
      entries: [
        {
          key: goodFixture.keyXdr,
          xdr: goodFixture.entryXdr,
          lastModifiedLedgerSeq: 5,
        },
        { key: badFixture.keyXdr, xdr: 'bad-xdr', lastModifiedLedgerSeq: 6 },
      ],
      latestLedger: 6,
    })

    mockDecodeScVal.mockResolvedValue({
      kind: 'primitive',
      path: [],
      scType: 'u32',
      value: 42,
      raw: { switch: 'ScvU32', value: 42 },
    })

    await useLensStore
      .getState()
      .loadContract('C_RAW', [goodFixture.keyXdr, badFixture.keyXdr])

    const state = getStoreState()
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(
      state.ledgerData[`C_RAW::ContractData::${goodFixture.keyXdr}`].value,
    ).toEqual({
      kind: 'primitive',
      path: [],
      scType: 'u32',
      value: 42,
      raw: { switch: 'ScvU32', value: 42 },
    })
    expect(
      state.ledgerData[`C_RAW::ContractData::${badFixture.keyXdr}`].value,
    ).toEqual({
      kind: 'raw-xdr',
      xdr: 'bad-xdr',
    })
    expect(
      state.ledgerData[`C_RAW::ContractData::${badFixture.keyXdr}`]
        .decodeErrorReason,
    ).toBe('invalid-ledger-entry-data')
  })

  it('ignores stale in-flight results and keeps newest response', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()

    const oldEntry = createContractDataLedgerEntry({
      contractSeed: 4,
      key: xdr.ScVal.scvSymbol('old-key'),
    })
    const newEntry = createContractDataLedgerEntry({
      contractSeed: 4,
      key: xdr.ScVal.scvSymbol('new-key'),
    })
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
        entries: [
          {
            key: newEntry.key,
            xdr: newEntry.xdr,
            lastModifiedLedgerSeq: 2,
          },
        ],
        latestLedger: 2,
      })

    mockDecodeScVal.mockResolvedValue({
      kind: 'primitive',
      path: [],
      scType: 'string',
      value: 'decoded',
      raw: { switch: 'ScvString', value: 'decoded' },
    })

    const firstCall = useLensStore
      .getState()
      .loadContract(oldEntry.contractId, [oldEntry.key])
    const secondCall = useLensStore
      .getState()
      .loadContract(newEntry.contractId, [newEntry.key])

    await secondCall

    if (resolveFirst) {
      resolveFirst({
        entries: [{ ...oldEntry, lastModifiedLedgerSeq: 1 }],
        latestLedger: 1,
      })
    }
    await firstCall

    const state = getStoreState()
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(
      state.ledgerData[`${newEntry.contractId}::ContractData::${newEntry.key}`]
        .rawXdr,
    ).toBe(newEntry.xdr)
    expect(
      state.ledgerData[`${oldEntry.contractId}::ContractData::${oldEntry.key}`],
    ).toBeUndefined()
  })

  it('rejects ledger entries whose contract key belongs to another contract', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()
    const requestedContractEntry = createContractDataLedgerEntry({
      contractSeed: 8,
      key: xdr.ScVal.scvSymbol('requested'),
    })
    const foreignContractEntry = createContractDataLedgerEntry({
      contractSeed: 9,
      key: xdr.ScVal.scvSymbol('foreign'),
    })
    mockGetLedgerEntries.mockResolvedValue({
      entries: [foreignContractEntry],
      latestLedger: 1,
    })

    await useLensStore
      .getState()
      .loadContract(requestedContractEntry.contractId, [
        foreignContractEntry.key,
      ])

    expect(getStoreState().ledgerData).toEqual({})
    expect(mockCreateDecoderWorkerSafe).not.toHaveBeenCalled()
  })

  it('coalesces refreshes that arrive during a decode batch', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()
    const oldFixture = makeContractDataFixture('old-batch')
    const middleFixture = makeContractDataFixture('middle-batch')
    const latestFixture = makeContractDataFixture('latest-batch')

    let resolveFirstDecode: ((value: unknown) => void) | undefined
    const firstDecode = new Promise<unknown>((resolve) => {
      resolveFirstDecode = resolve
    })
    const firstWorker = {
      decodeScVal: vi.fn().mockReturnValue(firstDecode),
      terminate: vi.fn(),
    }
    const latestWorker = {
      decodeScVal: vi.fn().mockResolvedValue({
        kind: 'primitive',
        path: [],
        scType: 'string',
        value: 'latest',
        raw: { switch: 'ScvString', value: 'new' },
      }),
      terminate: vi.fn(),
    }

    mockCreateDecoderWorkerSafe
      .mockImplementationOnce(() => Promise.resolve(firstWorker))
      .mockImplementationOnce(() => Promise.resolve(latestWorker))
    mockGetLedgerEntries
      .mockResolvedValueOnce({
        entries: [
          {
            key: oldFixture.keyXdr,
            xdr: oldFixture.entryXdr,
            lastModifiedLedgerSeq: 1,
          },
        ],
        latestLedger: 1,
      })
      .mockResolvedValueOnce({
        entries: [
          {
            key: middleFixture.keyXdr,
            xdr: middleFixture.entryXdr,
            lastModifiedLedgerSeq: 2,
          },
        ],
        latestLedger: 2,
      })
      .mockResolvedValueOnce({
        entries: [
          {
            key: latestFixture.keyXdr,
            xdr: latestFixture.entryXdr,
            lastModifiedLedgerSeq: 3,
          },
        ],
        latestLedger: 3,
      })

    const firstCall = useLensStore
      .getState()
      .loadContract('C_DECODE_STALE', [oldFixture.keyXdr])
    for (
      let attempt = 0;
      attempt < 10 && !firstWorker.decodeScVal.mock.calls.length;
      attempt += 1
    ) {
      await Promise.resolve()
    }

    const middleCall = useLensStore
      .getState()
      .loadContract('C_DECODE_STALE', [middleFixture.keyXdr])
    const latestCall = useLensStore
      .getState()
      .loadContract('C_DECODE_STALE', [latestFixture.keyXdr])
    for (
      let attempt = 0;
      attempt < 10 && mockGetLedgerEntries.mock.calls.length < 3;
      attempt += 1
    ) {
      await Promise.resolve()
    }

    expect(mockCreateDecoderWorkerSafe).toHaveBeenCalledTimes(1)
    expect(latestWorker.decodeScVal).not.toHaveBeenCalled()

    resolveFirstDecode?.({
      kind: 'primitive',
      path: [],
      scType: 'string',
      value: 'old',
      raw: { switch: 'ScvString', value: 'old' },
    })
    await Promise.all([firstCall, middleCall, latestCall])

    const state = getStoreState()
    expect(state.contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(latestWorker.decodeScVal).toHaveBeenCalledWith({
      xdr: latestFixture.valueXdr,
    })
    expect(latestWorker.decodeScVal).toHaveBeenCalledTimes(2)
    expect(
      state.ledgerData[`C_DECODE_STALE::ContractData::${latestFixture.keyXdr}`]
        .rawXdr,
    ).toBe(latestFixture.entryXdr)
    expect(
      state.ledgerData[`C_DECODE_STALE::ContractData::${oldFixture.keyXdr}`],
    ).toBeUndefined()
    expect(
      state.ledgerData[`C_DECODE_STALE::ContractData::${middleFixture.keyXdr}`],
    ).toBeUndefined()
  })

  describe('refreshActiveKeys action', () => {
    it('does nothing when there is no active contract', async () => {
      const { resetStore, useLensStore } = await import('../../store/lensStore')
      resetStore()

      await useLensStore.getState().refreshActiveKeys()
      expect(mockGetLedgerEntries).not.toHaveBeenCalled()
    })

    it('does nothing when there are no keys for the active contract', async () => {
      const { resetStore, useLensStore } = await import('../../store/lensStore')
      resetStore()

      useLensStore.setState({ activeContractId: 'C1', ledgerData: {} })

      await useLensStore.getState().refreshActiveKeys()
      expect(mockGetLedgerEntries).not.toHaveBeenCalled()
    })

    it('does not refresh local demo entries through the selected RPC', async () => {
      const { SAMPLE_CONTRACT_ID } = await import('../../lib/demoContract')
      const { resetStore, getStoreState, useLensStore } =
        await import('../../store/lensStore')
      resetStore()
      const demoEntry = {
        key: `${SAMPLE_CONTRACT_ID}::ContractData::demo-key`,
        contractId: SAMPLE_CONTRACT_ID,
        type: 'ContractData' as const,
        value: 'demo value',
        lastModifiedLedger: 1,
      }
      useLensStore.getState().upsertLedgerEntry(demoEntry)
      useLensStore.getState().setActiveContractId(SAMPLE_CONTRACT_ID)

      await useLensStore.getState().refreshActiveKeys()

      expect(mockGetLedgerEntries).not.toHaveBeenCalled()
      expect(getStoreState().ledgerData[demoEntry.key]).toEqual(demoEntry)
    })

    it('avoids duplicate in-flight work when a load is already active', async () => {
      const { resetStore, useLensStore } = await import('../../store/lensStore')
      resetStore()

      useLensStore.setState({
        activeContractId: 'C1',
        ledgerData: {
          'C1::Other::rpc-key-1': {
            key: 'C1::Other::rpc-key-1',
            contractId: 'C1',
            type: 'Other',
            value: null,
            lastModifiedLedger: 1,
            rawXdr: 'xdr',
          },
        },
      })

      let resolveFirst: ((value: GetLedgerEntriesResult) => void) | undefined
      mockGetLedgerEntries.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )

      const loadPromise = useLensStore
        .getState()
        .loadContract('C1', ['rpc-key-1'])
      await useLensStore.getState().refreshActiveKeys()

      expect(mockGetLedgerEntries).toHaveBeenCalledTimes(1)

      if (resolveFirst) {
        resolveFirst({ entries: [], latestLedger: 2 })
      }
      await loadPromise
    })

    it('emits sequence changes and counts fetches correctly on refresh', async () => {
      const { resetStore, getStoreState, useLensStore } =
        await import('../../store/lensStore')
      resetStore()

      useLensStore.setState({
        activeContractId: 'C_REFRESH',
        currentLedgerSequence: 100,
        ledgerData: {
          'C_REFRESH::Other::rpc-key-1': {
            key: 'C_REFRESH::Other::rpc-key-1',
            contractId: 'C_REFRESH',
            type: 'Other',
            value: null,
            lastModifiedLedger: 90,
            rawXdr: 'xdr-1',
          },
          'C_REFRESH::Other::rpc-key-2': {
            key: 'C_REFRESH::Other::rpc-key-2',
            contractId: 'C_REFRESH',
            type: 'Other',
            value: null,
            lastModifiedLedger: 95,
            rawXdr: 'xdr-2',
          },
        },
      })

      mockGetLedgerEntries.mockResolvedValueOnce({
        entries: [
          { key: 'rpc-key-1', xdr: 'xdr-1-new', lastModifiedLedgerSeq: 101 },
          { key: 'rpc-key-2', xdr: 'xdr-2-new', lastModifiedLedgerSeq: 101 },
        ],
        latestLedger: 105,
      })

      mockDecodeScVal.mockResolvedValue({
        kind: 'primitive',
        path: [],
        scType: 'string',
        value: 'decoded-new',
        raw: { switch: 'ScvString', value: 'decoded-new' },
      })

      await useLensStore.getState().refreshActiveKeys()

      expect(mockGetLedgerEntries).toHaveBeenCalledTimes(1)
      expect(mockGetLedgerEntries).toHaveBeenCalledWith(
        expect.objectContaining({ keys: ['rpc-key-1', 'rpc-key-2'] }),
      )

      const state = getStoreState()
      expect(state.currentLedgerSequence).toBe(105)
      expect(state.ledgerData['C_REFRESH::Other::rpc-key-1'].rawXdr).toBe(
        'xdr-1-new',
      )
      expect(state.ledgerData['C_REFRESH::Other::rpc-key-2'].rawXdr).toBe(
        'xdr-2-new',
      )
    })
  })

  it('restarts a failed decoder worker and keeps later entries decodable', async () => {
    const { resetStore, getStoreState, useLensStore } =
      await import('../../store/lensStore')
    resetStore()
    const firstFixture = makeContractDataFixture('first-key')
    const secondFixture = makeContractDataFixture('second-key')

    const failedWorker = {
      decodeScVal: vi
        .fn()
        .mockResolvedValueOnce({
          kind: 'primitive',
          path: [],
          scType: 'symbol',
          value: 'first-key',
          raw: { switch: 'ScvSymbol', value: 'first-key' },
        })
        .mockResolvedValueOnce({
          code: 'DECODE_WORKER_FAILED',
          message: 'Decoder worker stopped',
        }),
      terminate: vi.fn(),
    }
    const recoveredWorker = {
      decodeScVal: vi.fn().mockResolvedValue({
        kind: 'primitive',
        path: [],
        scType: 'string',
        value: 'recovered',
        raw: { switch: 'ScvString', value: 'recovered' },
      }),
      terminate: vi.fn(),
    }
    mockCreateDecoderWorkerSafe
      .mockImplementationOnce(() => Promise.resolve(failedWorker))
      .mockImplementationOnce(() => Promise.resolve(recoveredWorker))
    mockGetLedgerEntries.mockResolvedValue({
      entries: [
        { key: firstFixture.keyXdr, xdr: firstFixture.entryXdr },
        { key: secondFixture.keyXdr, xdr: secondFixture.entryXdr },
      ],
      latestLedger: 2,
    })

    await useLensStore
      .getState()
      .loadContract('C_RECOVER', [firstFixture.keyXdr, secondFixture.keyXdr])

    const { ledgerData, contractLoadStatus } = getStoreState()
    expect(contractLoadStatus).toBe(ContractLoadStatus.SUCCESS)
    expect(
      ledgerData[`C_RECOVER::ContractData::${firstFixture.keyXdr}`],
    ).toMatchObject({
      value: { kind: 'raw-xdr', xdr: firstFixture.entryXdr },
      decodeErrorReason: 'Decoder worker stopped',
    })
    expect(
      ledgerData[`C_RECOVER::ContractData::${secondFixture.keyXdr}`].value,
    ).toMatchObject({
      value: 'recovered',
    })
    expect(mockCreateDecoderWorkerSafe).toHaveBeenCalledTimes(2)
    expect(failedWorker.terminate).toHaveBeenCalledOnce()
    expect(recoveredWorker.terminate).toHaveBeenCalledOnce()
  })
})
