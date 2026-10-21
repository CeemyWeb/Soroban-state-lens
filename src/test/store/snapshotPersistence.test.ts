import * as Comlink from 'comlink'
import { xdr } from '@stellar/stellar-sdk'
import { beforeEach, describe, expect, it } from 'vitest'
import { serializeSnapshotEntry } from '../../lib/storage/snapshotDto'
import {
  NETWORK_CONFIG_STORAGE_KEY,
  clearPersistedNetworkConfig,
} from '../../store/persistence'
import { useLensStore } from '../../store/lensStore'
import { BigIntDisplayMode, ByteDisplayMode } from '../../store/types'
import { decoderWorkerApi } from '../../workers/decoder.worker'
import { isDecoderWorkerError } from '../../types/decoder-worker'
import type { DecoderWorkerApi } from '../../types/decoder-worker'

const contractId = 'C-test-contract'

async function captureScalarValue() {
  const { port1, port2 } = new MessageChannel()
  Comlink.expose(decoderWorkerApi, port1)
  const worker = Comlink.wrap<DecoderWorkerApi>(port2)

  try {
    const result = await worker.decodeScVal({
      xdr: xdr.ScVal.scvU32(42).toXDR('base64'),
    })
    if (isDecoderWorkerError(result)) {
      throw new Error(`Expected worker success, got: ${result.message}`)
    }
    return structuredClone(result)
  } finally {
    port1.close()
    port2.close()
  }
}

describe('snapshot persistence', () => {
  beforeEach(() => {
    clearPersistedNetworkConfig()
    useLensStore.setState({
      snapshots: {},
      networkConfig: {
        networkId: 'futurenet',
        networkPassphrase: 'Test SDF Future Network ; October 2022',
        rpcUrl: 'https://rpc-futurenet.stellar.org',
        horizonUrl: 'https://horizon-futurenet.stellar.org',
      },
    })
  })

  it('roundtrips a captured worker scalar and drops invalid sibling entries', async () => {
    const capturedNode = await captureScalarValue()
    const key = `${contractId}::persistent::counter`
    const capturedEntry = {
      key,
      contractId,
      type: 'ContractData' as const,
      durability: 'Persistent' as const,
      value: capturedNode,
      lastModifiedLedger: 100,
      expirationLedger: 200,
      rawXdr: xdr.ScVal.scvU32(42).toXDR('base64'),
    }

    useLensStore.getState().setNetworkConfig({
      networkId: 'testnet',
      networkPassphrase: 'Test SDF Network ; September 2015',
      rpcUrl: 'https://soroban-testnet.stellar.org',
    })
    useLensStore.getState().setByteDisplayMode(ByteDisplayMode.BASE64)
    useLensStore.getState().setBigIntDisplayMode(BigIntDisplayMode.FORMATTED)
    useLensStore.getState().addSnapshot(contractId, { [key]: capturedEntry })

    const persistedText = localStorage.getItem(NETWORK_CONFIG_STORAGE_KEY)
    expect(persistedText).not.toBeNull()
    const persisted = JSON.parse(persistedText!)
    const snapshot = persisted.state.snapshots[contractId][0]
    snapshot.ledgerData.invalid = {
      ...snapshot.ledgerData[key],
      key: 'invalid',
      lastModifiedLedger: -1,
    }
    snapshot.ledgerData.foreign = {
      ...snapshot.ledgerData[key],
      key: 'foreign',
      contractId: 'C-other-contract',
    }
    snapshot.ledgerData['mismatched-key'] = {
      ...snapshot.ledgerData[key],
      key: 'different-record-key',
    }
    localStorage.setItem(NETWORK_CONFIG_STORAGE_KEY, JSON.stringify(persisted))

    useLensStore.setState({ snapshots: {} })
    localStorage.setItem(NETWORK_CONFIG_STORAGE_KEY, JSON.stringify(persisted))
    await useLensStore.persist.rehydrate()

    const state = useLensStore.getState()
    const [restored] = state.getSnapshots(contractId)
    expect(restored.ledgerData).toEqual({ [key]: capturedEntry })
    expect(state.networkConfig.networkId).toBe('testnet')
    expect(state.byteDisplayMode).toBe(ByteDisplayMode.BASE64)
    expect(state.bigIntDisplayMode).toBe(BigIntDisplayMode.FORMATTED)
  })

  it('returns an explicit result for unsupported value data', () => {
    expect(
      serializeSnapshotEntry({
        key: 'counter',
        contractId,
        type: 'ContractData',
        value: () => 42,
        lastModifiedLedger: 100,
      }),
    ).toEqual({ ok: false, reason: 'unsupported-value' })
  })
})
