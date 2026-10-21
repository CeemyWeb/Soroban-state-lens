import type { ContractSnapshot, LedgerEntry } from '../../store/types'

export type PersistedValue =
  | null
  | boolean
  | number
  | string
  | Array<PersistedValue>
  | { [key: string]: PersistedValue }

export interface PersistedSnapshotEntry extends Omit<LedgerEntry, 'value'> {
  value: PersistedValue
}

export interface PersistedContractSnapshot extends Omit<
  ContractSnapshot,
  'ledgerData'
> {
  ledgerData: Record<string, PersistedSnapshotEntry>
}

export type SnapshotEntrySerializationResult =
  | { ok: true; entry: PersistedSnapshotEntry }
  | {
      ok: false
      reason: 'invalid-entry' | 'contract-mismatch' | 'unsupported-value'
    }

function serializeValue(
  value: unknown,
  ancestors: Set<object>,
): PersistedValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (value instanceof Uint8Array) {
    return Array.from(value)
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      return undefined
    }
    ancestors.add(value)
    const items: Array<PersistedValue> = []
    for (const item of value) {
      const serialized = serializeValue(item, ancestors)
      if (serialized === undefined) {
        ancestors.delete(value)
        return undefined
      }
      items.push(serialized)
    }
    ancestors.delete(value)
    return items
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      ancestors.has(value)
    ) {
      return undefined
    }
    ancestors.add(value)
    const result: Record<string, PersistedValue> = {}
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) {
        continue
      }
      const serialized = serializeValue(item, ancestors)
      if (serialized === undefined) {
        ancestors.delete(value)
        return undefined
      }
      result[key] = serialized
    }
    ancestors.delete(value)
    return result
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const entryTypes = new Set([
  'ContractData',
  'ContractCode',
  'Account',
  'Trustline',
  'Other',
])
const durabilities = new Set(['Persistent', 'Temporary', 'Instance'])

export function serializeSnapshotEntry(
  input: unknown,
  expectedContractId?: string,
): SnapshotEntrySerializationResult {
  if (!isRecord(input)) {
    return { ok: false, reason: 'invalid-entry' }
  }

  const {
    key,
    contractId,
    type,
    value,
    lastModifiedLedger,
    durability,
    expirationLedger,
    rawXdr,
  } = input

  if (
    typeof key !== 'string' ||
    key.length === 0 ||
    typeof contractId !== 'string' ||
    contractId.length === 0 ||
    !entryTypes.has(type as string) ||
    !Number.isSafeInteger(lastModifiedLedger) ||
    (lastModifiedLedger as number) < 0 ||
    (durability !== undefined && !durabilities.has(durability as string)) ||
    (expirationLedger !== undefined &&
      (!Number.isSafeInteger(expirationLedger) ||
        (expirationLedger as number) < 0)) ||
    (rawXdr !== undefined && typeof rawXdr !== 'string')
  ) {
    return { ok: false, reason: 'invalid-entry' }
  }
  if (expectedContractId !== undefined && contractId !== expectedContractId) {
    return { ok: false, reason: 'contract-mismatch' }
  }

  const serializedValue = serializeValue(value, new Set())
  if (serializedValue === undefined) {
    return { ok: false, reason: 'unsupported-value' }
  }

  return {
    ok: true,
    entry: {
      key,
      contractId,
      type: type as LedgerEntry['type'],
      value: serializedValue,
      lastModifiedLedger: lastModifiedLedger as number,
      ...(durability !== undefined
        ? { durability: durability as LedgerEntry['durability'] }
        : {}),
      ...(expirationLedger !== undefined
        ? { expirationLedger: expirationLedger as number }
        : {}),
      ...(rawXdr !== undefined ? { rawXdr } : {}),
    },
  }
}

function isValidSnapshotHeader(
  value: unknown,
  contractId: string,
): value is Omit<ContractSnapshot, 'ledgerData'> & {
  ledgerData?: unknown
} {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.contractId === contractId &&
    Number.isSafeInteger(value.timestamp) &&
    (value.timestamp as number) >= 0 &&
    (value.label === undefined || typeof value.label === 'string')
  )
}

export function serializeSnapshots(
  snapshots: Record<string, Array<ContractSnapshot>>,
): Record<string, Array<PersistedContractSnapshot>> {
  return parsePersistedSnapshots(snapshots)
}

export function parsePersistedSnapshots(
  input: unknown,
): Record<string, Array<PersistedContractSnapshot>> {
  if (!isRecord(input)) {
    return {}
  }

  const snapshots: Record<string, Array<PersistedContractSnapshot>> = {}
  for (const [contractId, candidates] of Object.entries(input)) {
    if (typeof contractId !== 'string' || !Array.isArray(candidates)) {
      continue
    }
    const validSnapshots: Array<PersistedContractSnapshot> = []
    for (const candidate of candidates) {
      if (!isValidSnapshotHeader(candidate, contractId)) {
        continue
      }

      const ledgerData: Record<string, PersistedSnapshotEntry> = {}
      if (isRecord(candidate.ledgerData)) {
        for (const [key, rawEntry] of Object.entries(candidate.ledgerData)) {
          const result = serializeSnapshotEntry(rawEntry, contractId)
          if (result.ok && result.entry.key === key) {
            ledgerData[key] = result.entry
          }
        }
      }

      validSnapshots.push({
        id: candidate.id,
        contractId,
        timestamp: candidate.timestamp,
        ledgerData,
        ...(candidate.label !== undefined ? { label: candidate.label } : {}),
      })
    }
    if (validSnapshots.length > 0) {
      snapshots[contractId] = validSnapshots
    }
  }
  return snapshots
}
