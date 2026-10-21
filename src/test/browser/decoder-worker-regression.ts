import * as Comlink from 'comlink'
import { Address, xdr } from '@stellar/stellar-sdk'
import { NETWORK_CONFIG_STORAGE_KEY } from '../../store/persistence'
import { useLensStore } from '../../store/lensStore'
import { isDecoderWorkerError } from '../../types/decoder-worker'
import { createDecoderWorker } from '../../workers/createDecoderWorker'

const resultsElement = document.querySelector<HTMLPreElement>('#results')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function runRegression(): Promise<void> {
  assert(resultsElement, 'Missing results element')
  const worker = createDecoderWorker()
  const passed: Array<string> = []
  const previousStorage = localStorage.getItem(NETWORK_CONFIG_STORAGE_KEY)
  const previousSnapshots = useLensStore.getState().snapshots

  try {
    const publicKey = new Uint8Array(32).fill(1)
    const contractBytes = new Uint8Array(32).fill(2)
    for (const address of [
      Address.account(publicKey as Buffer),
      Address.contract(contractBytes as Buffer),
    ]) {
      const result = await worker.decodeScVal({
        xdr: address.toScVal().toXDR('base64'),
      })
      assert(!isDecoderWorkerError(result), 'Address decode returned an error')
      assert(result.kind === 'address', 'Address reply was not an address node')
      assert(result.value === address.toString(), 'Address StrKey changed')
      assert(
        result.raw.value === address.toString(),
        'Raw address was not plain',
      )
      structuredClone(result)
      passed.push(`${result.addressType} address preserves its StrKey`)
    }

    const nestedMap = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('nested'),
        val: xdr.ScVal.scvVec([xdr.ScVal.scvU32(42)]),
      }),
    ])
    const truncated = await worker.decodeScVal({
      xdr: nestedMap.toXDR('base64'),
      maxDepth: 2,
    })
    assert(!isDecoderWorkerError(truncated), 'Nested decode returned an error')
    assert(truncated.kind === 'map', 'Nested reply was not a map node')
    const child = truncated.entries[0].value
    assert(child.kind === 'vec', 'Nested vector was not decoded')
    assert(
      child.items[0].kind === 'truncated',
      'Nested vector did not contain a truncation marker',
    )
    assert(
      child.items[0].path.length === 2,
      'Truncation marker has an unexpected path',
    )
    assert(
      child.items[0].depth === 2,
      'Truncation marker has an unexpected depth',
    )
    const keyPathSegment = child.items[0].path[0]
    assert(
      keyPathSegment.type === 'key',
      'Truncation marker path does not match the nested map/vector',
    )
    assert(
      keyPathSegment.key.kind === 'primitive' &&
        keyPathSegment.key.value === 'nested',
      'Truncation marker has an unexpected map key path',
    )
    const indexPathSegment = child.items[0].path[1]
    assert(
      indexPathSegment.type === 'index' && indexPathSegment.index === 0,
      'Truncation marker has an unexpected vector index path',
    )
    structuredClone(truncated)
    passed.push('nested map/vector truncation reply is clone-safe')

    const scalarXdr = xdr.ScVal.scvU32(42)
    const scalar = await worker.decodeScVal({
      xdr: scalarXdr.toXDR('base64'),
    })
    assert(!isDecoderWorkerError(scalar), 'Scalar decode returned an error')
    assert(scalar.kind === 'primitive', 'Scalar reply was not primitive')
    assert(scalar.value === 42, 'Scalar value changed during worker decoding')

    const contractId = 'C-browser-worker-regression'
    const key = `${contractId}::persistent::counter`
    useLensStore.getState().addSnapshot(
      contractId,
      {
        [key]: {
          key,
          contractId,
          type: 'ContractData',
          durability: 'Persistent',
          value: scalar,
          lastModifiedLedger: 42,
          rawXdr: scalarXdr.toXDR('base64'),
        },
      },
      42,
    )
    const savedState = localStorage.getItem(NETWORK_CONFIG_STORAGE_KEY)
    assert(savedState !== null, 'Snapshot state was not persisted')
    const persistedSnapshot =
      JSON.parse(savedState).state.snapshots[contractId][0]
    assert(
      persistedSnapshot.ledgerData[key].value.value === 42,
      'Persisted snapshot did not retain the captured scalar',
    )

    useLensStore.setState({ snapshots: {} })
    localStorage.setItem(NETWORK_CONFIG_STORAGE_KEY, savedState)
    await useLensStore.persist.rehydrate()
    const restored = useLensStore.getState().getSnapshots(contractId)[0]
    const restoredValue = restored.ledgerData[key].value
    assert(
      typeof restoredValue === 'object' &&
        restoredValue !== null &&
        'kind' in restoredValue &&
        restoredValue.kind === 'primitive' &&
        'value' in restoredValue &&
        restoredValue.value === 42,
      'Snapshot reload lost the scalar',
    )
    passed.push('captured worker scalar survives snapshot reload')
  } finally {
    useLensStore.setState({ snapshots: previousSnapshots })
    if (previousStorage === null) {
      localStorage.removeItem(NETWORK_CONFIG_STORAGE_KEY)
    } else {
      localStorage.setItem(NETWORK_CONFIG_STORAGE_KEY, previousStorage)
    }
    await worker[Comlink.releaseProxy]()
  }

  resultsElement.dataset.status = 'passed'
  resultsElement.textContent = JSON.stringify({ status: 'passed', passed })
}

runRegression().catch((error: unknown) => {
  if (resultsElement) {
    resultsElement.dataset.status = 'failed'
    resultsElement.textContent = JSON.stringify({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
  }
  throw error
})
