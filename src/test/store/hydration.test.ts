import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLensStore } from '../../store/lensStore'
import {
  NETWORK_CONFIG_STORAGE_KEY,
  clearPersistedNetworkConfig,
} from '../../store/persistence'
import { DEFAULT_NETWORKS } from '../../store/types'
import { diffSnapshotEntries } from '../../lib/diff/diffSnapshotEntries'

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
    })
  })

  it('keeps one 42-to-43 modified entry after snapshot reload', async () => {
    useLensStore.getState().addSnapshot(
      'C1',
      {
        value: {
          key: 'value',
          contractId: 'C1',
          type: 'ContractData',
          value: 42,
          lastModifiedLedger: 9,
        },
      },
      10,
      'Value 42',
    )
    useLensStore.getState().addSnapshot(
      'C1',
      {
        value: {
          key: 'value',
          contractId: 'C1',
          type: 'ContractData',
          value: 43,
          lastModifiedLedger: 10,
        },
      },
      11,
      'Value 43',
    )

    const savedState = localStorage.getItem(NETWORK_CONFIG_STORAGE_KEY)
    expect(savedState).not.toBeNull()
    if (savedState === null) throw new Error('Snapshot pair was not saved')
    useLensStore.setState({ snapshots: {} })
    localStorage.setItem(NETWORK_CONFIG_STORAGE_KEY, savedState)
    await useLensStore.persist.rehydrate()

    const [previous, next] = useLensStore.getState().getSnapshots('C1')
    expect(previous).toBeDefined()
    expect(next).toBeDefined()
    if (!previous || !next) throw new Error('Snapshot pair was not restored')
    const diff = diffSnapshotEntries(previous.ledgerData, next.ledgerData)
    expect(diff).toHaveLength(1)
    expect(diff[0]).toMatchObject({
      key: 'value',
      status: 'modified',
      prevEntry: { value: 42 },
      nextEntry: { value: 43 },
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
})
