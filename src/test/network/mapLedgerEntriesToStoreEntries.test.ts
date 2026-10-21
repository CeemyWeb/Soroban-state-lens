import { describe, expect, it } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import { mapLedgerEntriesToStoreEntries } from '../../lib/network/mapLedgerEntriesToStoreEntries'
import {
  makeAccountFixture,
  makeContractCodeFixture,
  makeContractDataFixture,
} from './ledgerEntryFixtures'

function makeContractDataKey(durability: 'persistent' | 'temporary'): string {
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: xdr.ScAddress.scAddressTypeContract(Buffer.alloc(32)),
      key: xdr.ScVal.scvSymbol('metadata-key'),
      durability: xdr.ContractDataDurability[durability](),
    }),
  )
  return ledgerKey.toXDR('base64')
}

describe('mapLedgerEntriesToStoreEntries', () => {
  it.each([
    ['persistent', 'Persistent'],
    ['temporary', 'Temporary'],
  ] as const)(
    'maps %s durability from the ledger key XDR',
    (durability, expected) => {
      const key = makeContractDataKey(durability)
      const [mapped] = mapLedgerEntriesToStoreEntries({
        contractId: 'CONTRACT_META',
        entries: [{ key, xdr: 'value-xdr', lastModifiedLedgerSeq: 77 }],
      })

      expect(mapped.durability).toBe(expected)
    },
  )

  it('marks temporary entries expired only after their live-until ledger', () => {
    const key = makeContractDataKey('temporary')
    const [expired] = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_META',
      latestLedger: 101,
      entries: [{ key, xdr: 'value-xdr', liveUntilLedgerSeq: 100 }],
    })
    const [stillLive] = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_META',
      latestLedger: 100,
      entries: [{ key, xdr: 'value-xdr', liveUntilLedgerSeq: 100 }],
    })

    expect(expired.expired).toBe(true)
    expect(stillLive.expired).toBeUndefined()
  })

  it('maps representative entries into stable store records', () => {
    const result = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_1',
      entries: [
        {
          key: 'ledger-key-1',
          xdr: 'xdr-1',
          lastModifiedLedgerSeq: 42,
          liveUntilLedgerSeq: 99,
        },
      ],
      decodedValuesByKey: {
        'ledger-key-1': { kind: 'primitive', scType: 'string', value: 'hello' },
      },
      keyInfoByKey: {
        'ledger-key-1': { type: 'ContractData', displayName: 'counter' },
      },
    })

    expect(result).toEqual([
      {
        key: 'CONTRACT_1::ContractData::ledger-key-1',
        contractId: 'CONTRACT_1',
        type: 'ContractData',
        displayName: 'counter',
        value: { kind: 'primitive', scType: 'string', value: 'hello' },
        canonicalKey: 'ledger-key-1',
        lastModifiedLedger: 42,
        expirationLedger: 99,
        rawXdr: 'xdr-1',
      },
    ])
  })

  it('classifies SDK-built ledger keys by their XDR variants', () => {
    const contractDataKey = makeContractDataFixture().keyXdr
    const contractCodeKey = makeContractCodeFixture().keyXdr
    const accountKey = makeAccountFixture().keyXdr
    const accountId = xdr.AccountId.publicKeyTypeEd25519(Buffer.alloc(32))
    const trustlineKey = xdr.LedgerKey.trustline(
      new xdr.LedgerKeyTrustLine({
        accountId,
        asset: xdr.TrustLineAsset.assetTypeNative(),
      }),
    ).toXDR('base64')

    const mapped = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_XDR',
      entries: [
        { key: contractDataKey, xdr: 'contract-data-entry' },
        { key: contractCodeKey, xdr: 'contract-code-entry' },
        { key: accountKey, xdr: 'account-entry' },
        { key: trustlineKey, xdr: 'trustline-entry' },
        { key: 'malformed-key', xdr: 'malformed-entry' },
      ],
    })

    expect(mapped.map((entry) => entry.type)).toEqual([
      'ContractData',
      'ContractCode',
      'Account',
      'Trustline',
      'Other',
    ])
  })

  it('normalizes padded and lowercase contract IDs before mapping', () => {
    const canonical = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_1',
      entries: [{ key: 'ledger-key-1', xdr: 'xdr-1' }],
    })
    const padded = mapLedgerEntriesToStoreEntries({
      contractId: '  contract_1  ',
      entries: [{ key: 'ledger-key-1', xdr: 'xdr-1' }],
    })

    expect(padded).toEqual(canonical)
    expect(padded[0].contractId).toBe('CONTRACT_1')
  })

  it('falls back safely when optional metadata is missing', () => {
    const result = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_2',
      entries: [{ key: 'ledger-key-2', xdr: 'xdr-2' }],
    })

    expect(result).toEqual([
      {
        key: 'CONTRACT_2::Other::ledger-key-2',
        contractId: 'CONTRACT_2',
        type: 'Other',
        value: 'xdr-2',
        canonicalKey: 'ledger-key-2',
        lastModifiedLedger: 0,
        expirationLedger: undefined,
        rawXdr: 'xdr-2',
      },
    ])
  })

  it('classifies contract data from LedgerKey XDR and retains its raw key', () => {
    const contract = xdr.ScAddress.scAddressTypeContract(new Uint8Array(32))
    const ledgerKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract,
        key: xdr.ScVal.scvSymbol('temporary-key'),
        durability: xdr.ContractDataDurability.temporary(),
      }),
    )
    const keyXdr = ledgerKey.toXDR('base64')

    const [entry] = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_TEMP',
      entries: [{ key: keyXdr, xdr: 'entry-xdr' }],
    })

    expect(entry).toMatchObject({
      key: `CONTRACT_TEMP::ContractData::${keyXdr}`,
      type: 'ContractData',
      durability: 'Temporary',
      canonicalKey: keyXdr,
    })
    expect(
      xdr.LedgerKey.fromXDR(entry.canonicalKey ?? '', 'base64')
        .toXDR()
        .toString('hex'),
    ).toBe(ledgerKey.toXDR().toString('hex'))
  })

  it('maps multiple entries deterministically', () => {
    const result = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_3',
      entries: [
        { key: 'a', xdr: 'xdr-a', lastModifiedLedgerSeq: 1 },
        { key: 'b', xdr: 'xdr-b', lastModifiedLedgerSeq: 2 },
      ],
    })

    expect(result).toHaveLength(2)
    expect(result[0]?.key).toBe('CONTRACT_3::Other::a')
    expect(result[1]?.key).toBe('CONTRACT_3::Other::b')
  })

  // ── Fallback paths (#305) ────────────────────────────────────────────

  it('defaults lastModifiedLedger to 0 when lastModifiedLedgerSeq is missing (#305)', () => {
    const result = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_4',
      entries: [
        {
          key: 'ledger-key-4',
          xdr: 'xdr-4',
          // no lastModifiedLedgerSeq — optional field absent
        },
      ],
      decodedValuesByKey: {
        'ledger-key-4': { kind: 'primitive', scType: 'u64', value: '123' },
      },
    })

    expect(result).toEqual([
      {
        key: 'CONTRACT_4::Other::ledger-key-4',
        contractId: 'CONTRACT_4',
        type: 'Other',
        value: { kind: 'primitive', scType: 'u64', value: '123' },
        canonicalKey: 'ledger-key-4',
        lastModifiedLedger: 0,
        expirationLedger: undefined,
        rawXdr: 'xdr-4',
      },
    ])
  })

  it('falls back to raw XDR when the decoded value is absent (#305)', () => {
    const result = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_5',
      entries: [
        {
          key: 'ledger-key-5',
          xdr: 'xdr-5',
          lastModifiedLedgerSeq: 7,
          liveUntilLedgerSeq: 10,
        },
      ],
      decodedValuesByKey: {
        // decoded value absent for this key
        'other-key': { kind: 'primitive', scType: 'string', value: 'ignored' },
      },
    })

    expect(result).toEqual([
      {
        key: 'CONTRACT_5::Other::ledger-key-5',
        contractId: 'CONTRACT_5',
        type: 'Other',
        value: 'xdr-5',
        canonicalKey: 'ledger-key-5',
        lastModifiedLedger: 7,
        expirationLedger: 10,
        rawXdr: 'xdr-5',
      },
    ])
  })

  it('treats an explicitly empty decoded map like an absent one (#305)', () => {
    const result = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_6',
      entries: [
        { key: 'ledger-key-6', xdr: 'xdr-6', lastModifiedLedgerSeq: 3 },
      ],
      decodedValuesByKey: {},
    })

    expect(result).toEqual([
      {
        key: 'CONTRACT_6::Other::ledger-key-6',
        contractId: 'CONTRACT_6',
        type: 'Other',
        value: 'xdr-6',
        canonicalKey: 'ledger-key-6',
        lastModifiedLedger: 3,
        expirationLedger: undefined,
        rawXdr: 'xdr-6',
      },
    ])
  })

  it('falls back per-entry when only some entries have decoded values (#305)', () => {
    const result = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_7',
      entries: [
        { key: 'decoded', xdr: 'xdr-decoded', lastModifiedLedgerSeq: 1 },
        { key: 'raw', xdr: 'xdr-raw', lastModifiedLedgerSeq: 2 },
      ],
      decodedValuesByKey: {
        decoded: { kind: 'primitive', scType: 'string', value: 'present' },
      },
    })

    expect(result).toEqual([
      {
        key: 'CONTRACT_7::Other::decoded',
        contractId: 'CONTRACT_7',
        type: 'Other',
        value: { kind: 'primitive', scType: 'string', value: 'present' },
        canonicalKey: 'decoded',
        lastModifiedLedger: 1,
        expirationLedger: undefined,
        rawXdr: 'xdr-decoded',
      },
      {
        key: 'CONTRACT_7::Other::raw',
        contractId: 'CONTRACT_7',
        type: 'Other',
        value: 'xdr-raw',
        canonicalKey: 'raw',
        lastModifiedLedger: 2,
        expirationLedger: undefined,
        rawXdr: 'xdr-raw',
      },
    ])
  })

  it('treats an explicit undefined decoded value as absent (#305)', () => {
    const result = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_8',
      entries: [{ key: 'k', xdr: 'xdr-k', lastModifiedLedgerSeq: 5 }],
      decodedValuesByKey: { k: undefined },
    })

    expect(result).toEqual([
      {
        key: 'CONTRACT_8::Other::k',
        contractId: 'CONTRACT_8',
        type: 'Other',
        value: 'xdr-k',
        canonicalKey: 'k',
        lastModifiedLedger: 5,
        expirationLedger: undefined,
        rawXdr: 'xdr-k',
      },
    ])
  })

  it('returns an empty array when there are no entries (#305)', () => {
    const result = mapLedgerEntriesToStoreEntries({
      contractId: 'CONTRACT_9',
      entries: [],
    })

    expect(result).toEqual([])
  })
})
