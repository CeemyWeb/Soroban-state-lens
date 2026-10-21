import { Address, xdr } from '@stellar/stellar-sdk'

import type { LedgerEntry as RpcLedgerEntry } from './getLedgerEntries'
import type { LedgerEntry as StoreLedgerEntry } from '../../store/types'

interface XdrSwitch {
  name: string
}

interface XdrScVal {
  switch: () => XdrSwitch
  value: () => unknown
  toXDR: (format: 'base64') => string
}

interface XdrContractData {
  contract: () => unknown
  key: () => XdrScVal
  val: () => XdrScVal
  durability: () => XdrSwitch
}

interface XdrLedgerEntryData {
  switch: () => XdrSwitch
  contractData: () => XdrContractData
}

interface XdrLedgerKey {
  switch: () => XdrSwitch
  contractData: () => {
    contract: () => unknown
    key: () => XdrScVal
    durability: () => XdrSwitch
  }
}

export type ExtractContractValueResult =
  | { supported: true; valueXdr: string }
  | {
      supported: false
      reason: 'invalid-ledger-entry-data' | 'unsupported-ledger-entry-type'
      entryType?: string
    }

export interface LedgerKeyInfo {
  type: StoreLedgerEntry['type']
  displayName?: string
  contractId?: string
  durability?: StoreLedgerEntry['durability']
}

export interface DecodedLedgerEntryMetadata {
  type: StoreLedgerEntry['type']
  contractId?: string
  durability?: StoreLedgerEntry['durability']
  storageKeyXdr?: string
  valueXdr?: string
}

function contractAddressToId(address: unknown): string {
  return Address.fromScVal(xdr.ScVal.scvAddress(address)).toString()
}

function decodeDurability(durability: {
  name: string
}): 'Persistent' | 'Temporary' {
  switch (durability.name) {
    case 'persistent':
      return 'Persistent'
    case 'temporary':
      return 'Temporary'
    default:
      throw new Error(
        `Unsupported contract data durability: ${durability.name}`,
      )
  }
}

/**
 * Decodes the ledger key and entry data XDR returned by getLedgerEntries.
 */
export function decodeLedgerEntryMetadata(
  entry: RpcLedgerEntry,
): DecodedLedgerEntryMetadata {
  const ledgerKey = xdr.LedgerKey.fromXDR(entry.key, 'base64')
  const entryData = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64')
  const keyType = ledgerKey.switch().name as string
  const dataType = entryData.switch().name as string

  if (keyType === 'contractData') {
    if (dataType !== 'contractData') {
      throw new Error('Contract-data ledger key does not match entry data')
    }

    const keyData = ledgerKey.contractData()
    const entryContractData = entryData.contractData()
    const contractId = contractAddressToId(keyData.contract())
    const entryContractId = contractAddressToId(entryContractData.contract())
    const keyDurability = decodeDurability(keyData.durability())
    const entryDurability = decodeDurability(entryContractData.durability())
    const storageKeyXdr = keyData.key().toXDR('base64') as string
    const entryKeyXdr = entryContractData.key().toXDR('base64') as string

    if (
      contractId !== entryContractId ||
      keyDurability !== entryDurability ||
      storageKeyXdr !== entryKeyXdr
    ) {
      throw new Error('Contract-data ledger key does not match entry data')
    }

    return {
      type: 'ContractData',
      contractId,
      durability: keyDurability,
      storageKeyXdr,
      valueXdr: entryContractData.val().toXDR('base64') as string,
    }
  }

  const typeByKey: Record<string, StoreLedgerEntry['type']> = {
    account: 'Account',
    trustline: 'Trustline',
    contractCode: 'ContractCode',
  }

  const type = typeByKey[keyType] ?? 'Other'
  if (type !== 'Other' && dataType !== keyType) {
    throw new Error(`${keyType} ledger key does not match entry data`)
  }

  return { type }
}

/**
 * Extracts the ScVal payload only from ContractData LedgerEntryData XDR.
 */
export function extractContractValueXdr(
  ledgerEntryDataXdr: string,
): ExtractContractValueResult {
  try {
    const ledgerEntryData = xdr.LedgerEntryData.fromXDR(
      ledgerEntryDataXdr,
      'base64',
    ) as XdrLedgerEntryData

    if (ledgerEntryData.switch().name !== 'contractData') {
      return {
        supported: false,
        reason: 'unsupported-ledger-entry-type',
        entryType: ledgerEntryData.switch().name,
      }
    }

    return {
      supported: true,
      valueXdr: ledgerEntryData.contractData().val().toXDR('base64'),
    }
  } catch {
    return { supported: false, reason: 'invalid-ledger-entry-data' }
  }
}

/**
 * Classifies a serialized LedgerKey and reads a readable label from
 * ContractData symbol/string keys when available.
 */
export function decodeLedgerKeyInfo(ledgerKeyXdr: string): LedgerKeyInfo {
  try {
    const ledgerKey = xdr.LedgerKey.fromXDR(
      ledgerKeyXdr,
      'base64',
    ) as XdrLedgerKey
    const variant = ledgerKey.switch().name

    switch (variant) {
      case 'contractData': {
        const keyData = ledgerKey.contractData()
        const key = keyData.key()
        const keyType = key.switch().name
        const value = key.value()
        const displayName =
          typeof value === 'string'
            ? value
            : value !== null &&
                typeof value === 'object' &&
                'toString' in value &&
                typeof value.toString === 'function'
              ? (
                  value as {
                    toString: (encoding?: string) => string
                  }
                ).toString('utf8')
              : undefined
        return {
          type: 'ContractData',
          contractId: contractAddressToId(keyData.contract()),
          durability: decodeDurability(keyData.durability()),
          ...(keyType === 'scvSymbol' || keyType === 'scvString'
            ? { displayName }
            : {}),
        }
      }
      case 'contractCode':
        return { type: 'ContractCode' }
      case 'account':
        return { type: 'Account' }
      case 'trustline':
        return { type: 'Trustline' }
      default:
        return { type: 'Other' }
    }
  } catch {
    return { type: 'Other' }
  }
}
