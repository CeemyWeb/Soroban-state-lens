import { Address, xdr } from '@stellar/stellar-sdk'
import { useLensStore } from '../../store/lensStore'
import { isDecoderWorkerError } from '../../types/decoder-worker'
import { createDecoderWorkerSafe } from '../../workers/createDecoderWorkerSafe'
import {
  RecoveringDecoder,
  toRawXdrFallback,
} from '../../workers/recoveringDecoder'

function showResult(value: string, status: 'passed' | 'failed'): void {
  const outputElement = document.querySelector<HTMLPreElement>('#result')
  if (!outputElement) {
    throw new Error('Missing decoder regression result element')
  }
  outputElement.dataset.status = status
  outputElement.textContent = value
}

async function runRegression(): Promise<void> {
  const NativeWorker = globalThis.Worker
  let createdWorkers = 0
  let terminatedWorkers = 0
  let shouldFailFirstReply = true

  class CountedWorker extends NativeWorker {
    constructor(...args: ConstructorParameters<typeof Worker>) {
      super(...args)
      createdWorkers += 1
    }

    terminate(): void {
      terminatedWorkers += 1
      super.terminate()
    }
  }

  globalThis.Worker = CountedWorker

  const decoder = new RecoveringDecoder(async () => {
    const worker = await createDecoderWorkerSafe()
    if (shouldFailFirstReply) {
      shouldFailFirstReply = false
      worker.terminate()
    }
    return worker
  }, 5_000)

  try {
    const failedXdr = xdr.ScVal.scvU32(42).toXDR('base64')
    const vectorXdr = xdr.ScVal.scvVec([
      xdr.ScVal.scvU32(7),
      xdr.ScVal.scvU32(9),
    ]).toXDR('base64')
    const mapXdr = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('numbers'),
        val: xdr.ScVal.scvVec([xdr.ScVal.scvU32(7), xdr.ScVal.scvU32(9)]),
      }),
    ]).toXDR('base64')

    const failedReply = await decoder.decodeScVal(failedXdr)
    if (
      !isDecoderWorkerError(failedReply) ||
      (failedReply.code !== 'DECODE_TIMEOUT' &&
        failedReply.code !== 'DECODE_WORKER_FAILED')
    ) {
      throw new Error(
        'Expected the deliberately terminated worker reply to fail',
      )
    }
    const firstFallback = toRawXdrFallback(failedXdr, failedReply)
    if (firstFallback.xdr !== failedXdr || !firstFallback.reason) {
      throw new Error(
        'Failed worker reply did not produce a useful raw-XDR fallback',
      )
    }

    const vectorReply = await decoder.decodeScVal(vectorXdr)
    if (isDecoderWorkerError(vectorReply) || vectorReply.kind !== 'vec') {
      throw new Error(
        `Fresh worker did not decode vector: ${isDecoderWorkerError(vectorReply) ? vectorReply.message : vectorReply.kind}`,
      )
    }
    if (
      vectorReply.items.length !== 2 ||
      vectorReply.items[0].kind !== 'primitive' ||
      vectorReply.items[0].value !== 7 ||
      vectorReply.items[1].kind !== 'primitive' ||
      vectorReply.items[1].value !== 9
    ) {
      throw new Error('Vector values did not preserve order 7, 9')
    }

    const mapReply = await decoder.decodeScVal(mapXdr)
    if (
      isDecoderWorkerError(mapReply) ||
      mapReply.kind !== 'map' ||
      mapReply.entries.length !== 1 ||
      mapReply.entries[0].key.kind !== 'primitive' ||
      mapReply.entries[0].key.value !== 'numbers' ||
      mapReply.entries[0].value.kind !== 'vec' ||
      mapReply.entries[0].value.items[0].kind !== 'primitive' ||
      mapReply.entries[0].value.items[0].value !== 7 ||
      mapReply.entries[0].value.items[1].kind !== 'primitive' ||
      mapReply.entries[0].value.items[1].value !== 9
    ) {
      throw new Error(
        `Fresh worker did not return a serializable map: ${isDecoderWorkerError(mapReply) ? mapReply.message : mapReply.kind}`,
      )
    }

    const publicKey = new Uint8Array(32).fill(1)
    const contractBytes = new Uint8Array(32).fill(2)
    for (const address of [
      Address.account(publicKey as Buffer),
      Address.contract(contractBytes as Buffer),
    ]) {
      const addressReply = await decoder.decodeScVal(
        address.toScVal().toXDR('base64'),
      )
      if (
        isDecoderWorkerError(addressReply) ||
        addressReply.kind !== 'address' ||
        addressReply.value !== address.toString() ||
        addressReply.raw.value !== address.toString()
      ) {
        throw new Error(
          `Address reply did not preserve clone-safe StrKey data: ${JSON.stringify(addressReply)}`,
        )
      }
      structuredClone(addressReply)
    }

    const nestedMap = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('nested'),
        val: xdr.ScVal.scvVec([xdr.ScVal.scvU32(42)]),
      }),
    ])
    const truncatedReply = await decoder.decodeScVal(
      nestedMap.toXDR('base64'),
      { maxDepth: 2 },
    )
    if (
      isDecoderWorkerError(truncatedReply) ||
      truncatedReply.kind !== 'map' ||
      truncatedReply.entries[0]?.value.kind !== 'vec' ||
      truncatedReply.entries[0].value.items[0]?.kind !== 'truncated' ||
      truncatedReply.entries[0].value.items[0].depth !== 2 ||
      truncatedReply.entries[0].value.items[0].path.length !== 2
    ) {
      throw new Error('Nested browser reply lost its truncation metadata')
    }
    structuredClone(truncatedReply)

    const store = useLensStore.getState()
    store.addSnapshot(
      'C_BROWSER',
      {
        vector: {
          key: 'vector',
          contractId: 'C_BROWSER',
          type: 'ContractData',
          value: vectorReply,
          lastModifiedLedger: 1,
          rawXdr: vectorXdr,
        },
      },
      1,
    )

    const storedJson = localStorage.getItem('ssl.network-config.v1')
    if (!storedJson) {
      throw new Error('Snapshot was not written to localStorage')
    }
    const persistedVersion = JSON.parse(storedJson) as {
      state?: {
        snapshots?: Record<
          string,
          Record<string, Array<{ entries?: Record<string, unknown> }>>
        >
      }
      version?: number
    }
    const persistedContractSnapshots =
      persistedVersion.state?.snapshots?.[
        useLensStore.getState().networkConfig.networkId
      ]?.C_BROWSER
    const persistedEntries =
      persistedContractSnapshots && persistedContractSnapshots.length > 0
        ? persistedContractSnapshots[0].entries
        : undefined
    if (
      persistedVersion.version !== 2 ||
      !persistedEntries ||
      !('vector' in persistedEntries)
    ) {
      throw new Error('Snapshot did not use the version-2 entry DTO')
    }

    useLensStore.setState({ snapshots: {} })
    localStorage.setItem('ssl.network-config.v1', storedJson)
    await useLensStore.persist.rehydrate()

    const reloadedSnapshots = useLensStore.getState().getSnapshots('C_BROWSER')
    if (reloadedSnapshots.length === 0) {
      throw new Error('Reloaded snapshot was missing')
    }
    const reloaded = reloadedSnapshots[0]
    const reloadedValue = reloaded.ledgerData.vector.value
    if (
      typeof reloadedValue !== 'object' ||
      reloadedValue === null ||
      !('items' in reloadedValue) ||
      !Array.isArray(reloadedValue.items) ||
      reloadedValue.items.length !== 2 ||
      reloadedValue.items[0].kind !== 'primitive' ||
      reloadedValue.items[0].value !== 7 ||
      reloadedValue.items[1].kind !== 'primitive' ||
      reloadedValue.items[1].value !== 9
    ) {
      throw new Error('Reloaded snapshot did not retain vector values 7, 9')
    }
    const reloadedVector = reloadedValue as typeof vectorReply
    const firstChildPath = reloadedVector.items[0].path.at(0)
    const secondChildPath = reloadedVector.items[1].path.at(0)
    if (
      firstChildPath?.type !== 'index' ||
      firstChildPath.index !== 0 ||
      secondChildPath?.type !== 'index' ||
      secondChildPath.index !== 1
    ) {
      throw new Error('Reloaded vector child paths were not retained')
    }

    decoder.terminate()
    if (createdWorkers !== 2 || terminatedWorkers !== 2) {
      throw new Error(
        `Expected 2 workers created and terminated; got ${createdWorkers} created, ${terminatedWorkers} terminated`,
      )
    }

    showResult(
      JSON.stringify(
        {
          status: 'passed',
          createdWorkers,
          terminatedWorkers,
          firstEntry: 'raw-XDR fallback after failed worker reply',
          secondEntry: 'decoded vector [7, 9]',
          nestedMap: 'decoded map containing vector [7, 9]',
          addresses: 'account and contract StrKeys retained across Comlink',
          truncation:
            'nested map/vector depth and path retained across Comlink',
          reloadedSnapshot: 'ordered values and child paths retained',
        },
        null,
        2,
      ),
      'passed',
    )
  } finally {
    decoder.terminate()
    globalThis.Worker = NativeWorker
  }
}

void runRegression().catch((error: unknown) => {
  showResult(
    JSON.stringify({
      status: 'failed',
      error:
        error instanceof Error ? (error.stack ?? error.message) : String(error),
    }),
    'failed',
  )
})
