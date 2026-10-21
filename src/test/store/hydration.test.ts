import { beforeEach, describe, expect, it, vi } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import { decoderWorkerApi } from '../../workers/decoder.worker'
import { isDecoderWorkerError } from '../../types/decoder-worker'
import { useLensStore } from '../../store/lensStore'
import {
  NETWORK_CONFIG_STORAGE_KEY,
  clearPersistedNetworkConfig,
  mergeNetworkConfig,
} from '../../store/persistence'
import { DEFAULT_NETWORKS } from '../../store/types'

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
  beforeEach(() => {
    clearPersistedNetworkConfig()
    vi.clearAllMocks()

    // We need to reset the store state manually since Zustand store is a singleton in tests
    useLensStore.setState({
      networkConfig: DEFAULT_NETWORKS.futurenet,
      ledgerData: {},
      expandedNodes: [],
      snapshots: {},
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
    const legacyPersistedState = {
      state: {
        networkConfig: {
          kind: 'preset',
          networkId: 'testnet',
        },
      },
      version: 0,
    }
    const currentPersistedState = {
      state: {
        networkConfig: {
          kind: 'preset',
          networkId: 'mainnet',
        },
      },
      version: 1,
    }
    const futurePersistedState = {
      state: {
        networkConfig: {
          kind: 'preset',
          networkId: 'futurenet',
        },
      },
      version: 999,
    }

    expect(
      mergeNetworkConfig(legacyPersistedState, {
        networkConfig: DEFAULT_NETWORKS.futurenet,
      }).networkConfig,
    ).toEqual(DEFAULT_NETWORKS.testnet)

    expect(
      mergeNetworkConfig(currentPersistedState, {
        networkConfig: DEFAULT_NETWORKS.futurenet,
      }).networkConfig,
    ).toEqual(DEFAULT_NETWORKS.mainnet)

    expect(
      mergeNetworkConfig(futurePersistedState, {
        networkConfig: DEFAULT_NETWORKS.futurenet,
      }).networkConfig,
    ).toEqual(DEFAULT_NETWORKS.futurenet)
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

  it('migrates version-1 scalar snapshots without changing snapshot identity', async () => {
    const snapshot = {
      id: 'snapshot-legacy-42',
      contractId: 'C_LEGACY',
      timestamp: 42,
      ledgerData: {
        'C_LEGACY::ContractData::counter': {
          key: 'C_LEGACY::ContractData::counter',
          contractId: 'C_LEGACY',
          type: 'ContractData',
          value: {
            kind: 'primitive',
            path: [],
            scType: 'u32',
            value: 42,
            raw: { switch: 'ScvU32', value: 42 },
          },
          lastModifiedLedger: 10,
          rawXdr: 'legacy-xdr',
        },
      },
    }
    localStorage.setItem(
      NETWORK_CONFIG_STORAGE_KEY,
      JSON.stringify({
        state: {
          networkConfig: { kind: 'preset', networkId: 'testnet' },
          snapshots: { C_LEGACY: [snapshot] },
        },
        version: 1,
      }),
    )

    await useLensStore.persist.rehydrate()

    const migrated = useLensStore.getState().snapshots.C_LEGACY[0]
    expect(migrated.id).toBe(snapshot.id)
    expect(migrated.ledgerData).toEqual(snapshot.ledgerData)
    expect(useLensStore.getState().networkConfig).toEqual(
      DEFAULT_NETWORKS.testnet,
    )
  })

  it('rejects snapshot data from an unrecognized future version', async () => {
    localStorage.setItem(
      NETWORK_CONFIG_STORAGE_KEY,
      JSON.stringify({
        state: {
          networkConfig: { kind: 'preset', networkId: 'testnet' },
          snapshots: {
            C_FUTURE: [
              {
                id: 'future-snapshot',
                contractId: 'C_FUTURE',
                timestamp: 1,
                entries: {},
              },
            ],
          },
        },
        version: 999,
      }),
    )

    await useLensStore.persist.rehydrate()

    expect(useLensStore.getState().snapshots).toEqual({})
    expect(useLensStore.getState().networkConfig).toEqual(
      DEFAULT_NETWORKS.futurenet,
    )
  })

  it('persists and rehydrates a decoded vector snapshot with its ordered tree', async () => {
    const xdrValue = xdr.ScVal.scvVec([
      xdr.ScVal.scvU32(7),
      xdr.ScVal.scvU32(9),
    ])
    const value = await decoderWorkerApi.decodeScVal({
      xdr: xdrValue.toXDR('base64'),
    })
    if (isDecoderWorkerError(value)) {
      throw new Error(value.message)
    }

    useLensStore.getState().addSnapshot('C_VECTOR', {
      vector: {
        key: 'vector',
        contractId: 'C_VECTOR',
        type: 'ContractData',
        value,
        lastModifiedLedger: 1,
        rawXdr: xdrValue.toXDR('base64'),
      },
    })

    const persistedJson = localStorage.getItem(NETWORK_CONFIG_STORAGE_KEY)
    expect(persistedJson).not.toBeNull()
    useLensStore.setState({ snapshots: {} })
    if (persistedJson) {
      localStorage.setItem(NETWORK_CONFIG_STORAGE_KEY, persistedJson)
    }
    await useLensStore.persist.rehydrate()

    const entry =
      useLensStore.getState().snapshots.C_VECTOR[0].ledgerData.vector
    expect(entry.value).toMatchObject({
      kind: 'vec',
      items: [
        { kind: 'primitive', scType: 'u32', value: 7 },
        { kind: 'primitive', scType: 'u32', value: 9 },
      ],
    })
    if (typeof entry.value === 'object' && entry.value !== null) {
      const vector = entry.value as { items: Array<{ path: unknown }> }
      expect(vector.items.map((item) => item.path)).toEqual([
        [{ type: 'index', index: 0 }],
        [{ type: 'index', index: 1 }],
      ])
    }
  })
})
