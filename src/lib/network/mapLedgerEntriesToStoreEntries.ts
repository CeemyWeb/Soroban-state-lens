import { xdr } from '@stellar/stellar-sdk'
import { normalizeContractIdInput } from '../validation/normalizeContractIdInput'
import { makeLedgerEntryKey } from '../storage/makeLedgerEntryKey'
import { formatStorageKeyPreview } from '../format/formatStorageKeyPreview'
import { decodeLedgerKeyInfo } from './decodeLedgerEntry'
import type {
  DecodedLedgerEntryMetadata,
  LedgerKeyInfo,
} from './decodeLedgerEntry'
import type { LedgerEntry as RpcLedgerEntry } from './getLedgerEntries'
import type { LedgerEntry as StoreLedgerEntry } from '../../store/types'
import type { Node } from '../../types/node'

interface MapLedgerEntriesParams {
  contractId: string
  entries: Array<RpcLedgerEntry>
  latestLedger?: number
  decodedValuesByKey?: Record<string, unknown>
  decodeErrorReasonsByKey?: Record<string, string>
  keyInfoByKey?: Partial<Record<string, LedgerKeyInfo>>
  metadataByKey?: Partial<Record<string, DecodedLedgerEntryMetadata>>
  decodedStorageKeysByKey?: Partial<Record<string, Node>>
}

function decodeDurability(key: string): StoreLedgerEntry['durability'] {
  try {
    const ledgerKey = xdr.LedgerKey.fromXDR(key, 'base64')
    if (ledgerKey.switch().name !== 'contractData') {
      return undefined
    }

    if (
      ledgerKey.contractData().key().switch().name ===
      'scvLedgerKeyContractInstance'
    ) {
      return 'Instance'
    }

    const durability = ledgerKey.contractData().durability().name
    if (durability === 'persistent') {
      return 'Persistent'
    }
    if (durability === 'temporary') {
      return 'Temporary'
    }
  } catch {
    return undefined
  }

  return undefined
}

/**
 * Maps raw RPC ledger-entry payloads into the canonical store entry shape.
 */
export function mapLedgerEntriesToStoreEntries(
  params: MapLedgerEntriesParams,
): Array<StoreLedgerEntry> {
  const {
    entries,
    latestLedger,
    decodedValuesByKey = {},
    decodeErrorReasonsByKey = {},
    keyInfoByKey = {},
    metadataByKey = {},
    decodedStorageKeysByKey = {},
  } = params
  const contractId = normalizeContractIdInput(params.contractId)
  return entries.map((entry) => {
    const keyInfo = keyInfoByKey[entry.key]
    const decodedKeyInfo = decodeLedgerKeyInfo(entry.key)
    const metadata = metadataByKey[entry.key]
    const type =
      decodedKeyInfo.type !== 'Other'
        ? decodedKeyInfo.type
        : (keyInfo?.type ?? metadata?.type ?? decodedKeyInfo.type)
    const displayName = decodedKeyInfo.displayName ?? keyInfo?.displayName
    const durability = decodeDurability(entry.key)
    const decodedStorageKey = decodedStorageKeysByKey[entry.key]
    const last = entry.lastModifiedLedgerSeq
    const live = entry.liveUntilLedgerSeq

    const lastModifiedLedger =
      typeof last === 'number' &&
      Number.isFinite(last) &&
      last >= 0 &&
      Number.isInteger(last)
        ? last
        : 0

    const expirationLedger =
      typeof live === 'number' &&
      Number.isFinite(live) &&
      live >= 0 &&
      Number.isInteger(live)
        ? live
        : undefined

    return {
      key: makeLedgerEntryKey(contractId, type, entry.key),
      contractId,
      type,
      ...(durability ? { durability } : {}),
      ...(displayName ? { displayName } : {}),
      canonicalKey: entry.key,
      ...(decodedStorageKey
        ? { displayKey: formatStorageKeyPreview(decodedStorageKey) }
        : {}),
      value:
        decodedValuesByKey[entry.key] !== undefined
          ? decodedValuesByKey[entry.key]
          : entry.xdr,
      lastModifiedLedger,
      expirationLedger,
      ...(durability === 'Temporary' &&
      expirationLedger !== undefined &&
      latestLedger !== undefined &&
      latestLedger > expirationLedger
        ? { expired: true }
        : {}),
      rawXdr: entry.xdr,
      ...(decodeErrorReasonsByKey[entry.key]
        ? { decodeErrorReason: decodeErrorReasonsByKey[entry.key] }
        : {}),
    }
  })
}
