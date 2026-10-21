import { beforeEach, describe, expect, it, vi } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import { decoderWorkerApi } from '../../workers/decoder.worker'
import { isDecoderWorkerError } from '../../types/decoder-worker'
import { useLensStore } from '../../store/lensStore'
import {
  NETWORK_CONFIG_STORAGE_KEY,
  clearPersistedNetworkConfig,
  mergeNetworkConfig,
  sanitizeSnapshots,
} from '../../store/persistence'
import { DEFAULT_NETWORKS } from '../../store/types'
import type { LedgerEntry } from '../../store/types'

// Simple localStorage mock
const localStorageMock = (function () {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString()
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

// Mock window and localStorage globally
Object.defineProperty(global, 'window', { value: global, writable: true })
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('LensStore Hydration', () => {
  it('preserves exact i128 and u256 decimal strings across snapshot hydration', async () => {
    const i128 = '-170141183460469231731687303715884105728'
    const u256 =
      '115792089237316195423570985008687907853269984665640564039457584007913129639935'
    useLensStore.getState().addSnapshot(
      'C1',
      {
        i128: {
          key: 'i128',
          contractId: 'C1',
          type: 'ContractData',
          value: i128,
          lastModifiedLedger: 9,
        },
        u256: {
          key: 'u256',
          contractId: 'C1',
          type: 'ContractData',
          value: u256,
          lastModifiedLedger: 9,
        },
      },
      10,
      'Large integer fixture',
    )

    const savedState = localStorage.getItem(NETWORK_CONFIG_STORAGE_KEY)
    expect(savedState).not.toBeNull()
    if (savedState === null)
      throw new Error('Integer snapshot state was not saved')
    useLensStore.setState({ snapshots: {} })
    localStorage.setItem(NETWORK_CONFIG_STORAGE_KEY, savedState)
    await useLensStore.persist.rehydrate()

    expect(useLensStore.getState().getSnapshots('C1')).toMatchObject([
      {
        ledgerData: {
          i128: { value: i128 },
          u256: { value: u256 },
        },
      },
    ])
  })

  beforeEach(() => {
    clearPersistedNetworkConfig()
    vi.clearAllMocks()

    // We need to reset the store state manually since Zustand store is a singleton in tests
    useLensStore.setState({
      networkConfig: DEFAULT_NETWORKS.futurenet,
      ledgerData: {},
      expandedNodes: [],
      snapshots: {},
      watchlist: {},
    })
  })

  it('restores valid snapshots and drops malformed snapshots on hydration', async () => {
    const timestamp = Date.now() - 100
    const validSnapshot = {
      id: 'snapshot-valid',
      contractId: 'C1',
      timestamp,
      ledgerSequence: 10,
      ledgerData: {
        key1: {
          key: 'key1',
          contractId: 'C1',
          type: 'ContractData',
          value: { count: 3 },
          lastModifiedLedger: 9,
        },
      },
      label: 'Saved state',
    }
    const malformedSnapshot = {
      ...validSnapshot,
      id: 'snapshot-malformed',
      ledgerData: [],
    }
    localStorage.setItem(
      NETWORK_CONFIG_STORAGE_KEY,
      JSON.stringify({
        state: {
          networkConfig: { kind: 'preset', networkId: 'testnet' },
          snapshots: { C1: [validSnapshot, malformedSnapshot] },
        },
        version: 1,
      }),
    )

    await useLensStore.persist.rehydrate()

    expect(useLensStore.getState().getSnapshots('C1')).toEqual([validSnapshot])
  })

  it('marks snapshots with rejected entries incomplete and preserves valid empty snapshots', () => {
    const sanitized = sanitizeSnapshots({
      C1: [
        {
          id: 'damaged',
          contractId: 'C1',
          timestamp: Date.now() - 1,
          ledgerSequence: 10,
          ledgerData: { rejected: { key: 'wrong-key' } },
        },
        {
          id: 'empty',
          contractId: 'C1',
          timestamp: Date.now() - 1,
          ledgerSequence: 11,
          ledgerData: {},
        },
      ],
    })

    expect(sanitized.C1[0]).toMatchObject({ id: 'damaged', incomplete: true })
    expect(sanitized.C1[0]?.ledgerData).toEqual({})
    expect(sanitized.C1[1]).not.toHaveProperty('incomplete')
    expect(sanitized.C1[1]?.ledgerData).toEqual({})
  })

  it('persists snapshots and restores them after a store reload', async () => {
    useLensStore.getState().addSnapshot(
      'C1',
      {
        key1: {
          key: 'key1',
          contractId: 'C1',
          type: 'ContractData',
          value: { count: 4 },
          lastModifiedLedger: 11,
        },
      },
      12,
      'Persisted snapshot',
    )

    const savedState = localStorage.getItem(NETWORK_CONFIG_STORAGE_KEY)
    expect(savedState).not.toBeNull()
    if (savedState === null) throw new Error('Snapshot state was not saved')
    useLensStore.setState({ snapshots: {} })
    localStorage.setItem(NETWORK_CONFIG_STORAGE_KEY, savedState)

    await useLensStore.persist.rehydrate()

    expect(useLensStore.getState().getSnapshots('C1')).toHaveLength(1)
    expect(useLensStore.getState().getSnapshots('C1')[0]).toMatchObject({
      contractId: 'C1',
      ledgerSequence: 12,
      label: 'Persisted snapshot',
    })
  })

  it('persists a decoded map entry with key metadata and its child value', async () => {
    const scVal = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('answer'),
        val: xdr.ScVal.scvU32(7),
      }),
    ])
    const decodedValue = await decoderWorkerApi.decodeScVal({
      xdr: scVal.toXDR('base64'),
    })
    if (isDecoderWorkerError(decodedValue)) {
      throw new Error(`Map fixture decoding failed: ${decodedValue.message}`)
    }

    const entryKey = 'C1::ContractData::map-entry'
    const entry: LedgerEntry = {
      key: entryKey,
      contractId: 'C1',
      type: 'ContractData',
      value: decodedValue,
      lastModifiedLedger: 42,
    }
    useLensStore
      .getState()
      .addSnapshot('C1', { [entryKey]: entry }, 43, 'Map capture')

    const savedState = localStorage.getItem(NETWORK_CONFIG_STORAGE_KEY)
    expect(savedState).not.toBeNull()
    if (savedState === null) throw new Error('Map snapshot was not saved')
    useLensStore.setState({ snapshots: {} })
    localStorage.setItem(NETWORK_CONFIG_STORAGE_KEY, savedState)

    await useLensStore.persist.rehydrate()

    const snapshots = useLensStore.getState().getSnapshots('C1')
    expect(snapshots).toHaveLength(1)
    const restoredValue = snapshots[0].ledgerData[entryKey].value
    expect(restoredValue).toMatchObject({
      kind: 'map',
      entries: [
        {
          key: { kind: 'primitive', scType: 'symbol', value: 'answer' },
          value: { kind: 'primitive', scType: 'u32', value: 7 },
        },
      ],
    })
  })

  it('hydrates with a valid preset network from storage', async () => {
    // 1. Prepare storage with a valid config (Testnet)
    const persistedState = {
      state: {
        networkConfig: {
          kind: 'preset',
          networkId: 'testnet',
        },
      },
      version: 0,
    }
    localStorage.setItem(
      NETWORK_CONFIG_STORAGE_KEY,
      JSON.stringify(persistedState),
    )

    // 2. Trigger hydration
    // Note: In Zustand v5, persist middleware hydrates automatically if storage is sync.
    // However, to be absolutely sure in a test environment, we can check the state.
    // We might need to call rehydrate if it was already initialized.
    await useLensStore.persist.rehydrate()

    // 3. Verify the store state
    const state = useLensStore.getState()
    expect(state.networkConfig).toEqual(DEFAULT_NETWORKS.testnet)
  })

  it('hydrates with a valid custom RPC config from storage', async () => {
    const persistedState = {
      state: {
        networkConfig: {
          kind: 'custom',
          rpcUrl: 'https://custom-rpc.com/',
        },
      },
      version: 0,
    }
    localStorage.setItem(
      NETWORK_CONFIG_STORAGE_KEY,
      JSON.stringify(persistedState),
    )

    await useLensStore.persist.rehydrate()

    const state = useLensStore.getState()
    expect(state.networkConfig).toEqual({
      networkId: 'custom',
      networkPassphrase: 'Custom Network',
      rpcUrl: 'https://custom-rpc.com',
      horizonUrl: DEFAULT_NETWORKS.futurenet.horizonUrl,
    })
  })

  it('falls back to default network when storage is empty', async () => {
    // Storage is already cleared in beforeEach

    await useLensStore.persist.rehydrate()

    const state = useLensStore.getState()
    expect(state.networkConfig).toEqual(DEFAULT_NETWORKS.futurenet)
  })

  it('falls back to default network when storage contains invalid config', async () => {
    const invalidPersistedState = {
      state: {
        networkConfig: {
          kind: 'preset',
          networkId: 'invalid',
        },
      },
      version: 0,
    }
    localStorage.setItem(
      NETWORK_CONFIG_STORAGE_KEY,
      JSON.stringify(invalidPersistedState),
    )

    await useLensStore.persist.rehydrate()

    const state = useLensStore.getState()
    expect(state.networkConfig).toEqual(DEFAULT_NETWORKS.futurenet)
  })

  it('accepts legacy and current persisted versions while ignoring future ones', () => {
    const snapshot = {
      id: 'snapshot-1',
      contractId: 'C1',
      timestamp: 1,
      ledgerSequence: 1,
      ledgerData: {},
    }
    const legacyPersistedState = {
      state: {
        networkConfig: {
          kind: 'preset',
          networkId: 'testnet',
        },
        snapshots: { C1: [snapshot] },
      },
      version: 0,
    }
    const currentPersistedState = {
      state: {
        networkConfig: {
          kind: 'preset',
          networkId: 'mainnet',
        },
        snapshots: { C1: [snapshot] },
      },
      version: 1,
    }
    const futurePersistedState = {
      state: {
        networkConfig: {
          kind: 'preset',
          networkId: 'futurenet',
        },
        snapshots: { C1: [snapshot] },
      },
      version: 999,
    }

    expect(
      mergeNetworkConfig(legacyPersistedState, {
        networkConfig: DEFAULT_NETWORKS.futurenet,
      }).networkConfig,
    ).toEqual(DEFAULT_NETWORKS.testnet)
    expect(
      mergeNetworkConfig(legacyPersistedState, {
        networkConfig: DEFAULT_NETWORKS.futurenet,
      }).snapshots,
    ).toEqual({ testnet: { C1: [snapshot] } })

    expect(
      mergeNetworkConfig(currentPersistedState, {
        networkConfig: DEFAULT_NETWORKS.futurenet,
      }).networkConfig,
    ).toEqual(DEFAULT_NETWORKS.mainnet)
    expect(
      mergeNetworkConfig(currentPersistedState, {
        networkConfig: DEFAULT_NETWORKS.futurenet,
      }).snapshots,
    ).toEqual({ mainnet: { C1: [snapshot] } })

    expect(
      mergeNetworkConfig(futurePersistedState, {
        networkConfig: DEFAULT_NETWORKS.futurenet,
      }).networkConfig,
    ).toEqual(DEFAULT_NETWORKS.futurenet)
    expect(
      mergeNetworkConfig(futurePersistedState, {
        networkConfig: DEFAULT_NETWORKS.futurenet,
      }).snapshots,
    ).toEqual({})
  })

  it('falls back to default network when storage contains unknown keys', async () => {
    const invalidPersistedState = {
      state: {
        networkConfig: {
          kind: 'mystery',
          someStrangeKey: 'intruder',
        },
      },
      version: 0,
    }
    localStorage.setItem(
      NETWORK_CONFIG_STORAGE_KEY,
      JSON.stringify(invalidPersistedState),
    )

    await useLensStore.persist.rehydrate()

    const state = useLensStore.getState()
    // Validation should fail because of unknown key, thus falling back to default
    expect(state.networkConfig).toEqual(DEFAULT_NETWORKS.futurenet)
  })

  it('preserves watchlist state after removing the final item', async () => {
    const { addToWatchlist, removeFromWatchlist } = useLensStore.getState()

    addToWatchlist('contract-1', '/path/to/key1')
    removeFromWatchlist('contract-1', '/path/to/key1')

    const state = useLensStore.getState()
    expect(state.watchlist).toEqual({})

    await useLensStore.persist.rehydrate()
    expect(useLensStore.getState().watchlist).toEqual({})
  })
})
