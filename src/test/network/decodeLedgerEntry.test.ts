import { describe, expect, it } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'

import {
  decodeLedgerEntryMetadata,
  decodeLedgerKeyInfo,
  extractContractValueXdr,
} from '../../lib/network/decodeLedgerEntry'
import { createContractDataLedgerEntry } from '../helpers/ledgerEntryFixtures'
import {
  makeAccountFixture,
  makeContractCodeFixture,
  makeContractDataFixture,
} from './ledgerEntryFixtures'

describe('decodeLedgerEntryMetadata', () => {
  it('extracts the contract, storage key, value, and durability from XDR', () => {
    const fixture = createContractDataLedgerEntry({
      contractSeed: 1,
      key: xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('owner'),
        xdr.ScVal.scvSymbol('balance'),
      ]),
      value: xdr.ScVal.scvSymbol('stored-value'),
    })

    expect(decodeLedgerEntryMetadata(fixture)).toEqual({
      type: 'ContractData',
      contractId: fixture.contractId,
      durability: 'Persistent',
      storageKeyXdr: xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('owner'),
        xdr.ScVal.scvSymbol('balance'),
      ]).toXDR('base64'),
      valueXdr: xdr.ScVal.scvSymbol('stored-value').toXDR('base64'),
    })
  })

  it('rejects key and entry data that describe different storage keys', () => {
    const fixture = createContractDataLedgerEntry({
      contractSeed: 2,
      key: xdr.ScVal.scvSymbol('key'),
    })
    const mismatched = createContractDataLedgerEntry({
      contractSeed: 2,
      key: xdr.ScVal.scvSymbol('other-key'),
    })

    expect(() =>
      decodeLedgerEntryMetadata({ ...fixture, xdr: mismatched.xdr }),
    ).toThrow('Contract-data ledger key does not match entry data')
  })
})
describe('ledger entry XDR decoding', () => {
  it('extracts a ContractData value ScVal from LedgerEntryData XDR', () => {
    const fixture = makeContractDataFixture()

    expect(extractContractValueXdr(fixture.entryXdr)).toEqual({
      supported: true,
      valueXdr: fixture.valueXdr,
    })
  })

  it.each([
    ['ContractCode', makeContractCodeFixture],
    ['Account', makeAccountFixture],
  ])('does not decode %s LedgerEntryData as a ScVal', (_name, makeFixture) => {
    const fixture = makeFixture()

    expect(extractContractValueXdr(fixture.entryXdr)).toMatchObject({
      supported: false,
      reason: 'unsupported-ledger-entry-type',
    })
  })

  it('returns an explicit unsupported result for malformed LedgerEntryData', () => {
    expect(extractContractValueXdr('invalid-xdr')).toEqual({
      supported: false,
      reason: 'invalid-ledger-entry-data',
    })
  })

  it('classifies decoded LedgerKey variants and reads a symbol root label', () => {
    const dataKey = makeContractDataFixture('counter')
    const codeKey = makeContractCodeFixture()
    const accountKey = makeAccountFixture()

    expect(decodeLedgerKeyInfo(dataKey.keyXdr)).toEqual({
      type: 'ContractData',
      displayName: 'counter',
      contractId: dataKey.contractId,
      durability: 'Persistent',
    })
    expect(decodeLedgerKeyInfo(codeKey.keyXdr)).toEqual({
      type: 'ContractCode',
    })
    expect(decodeLedgerKeyInfo(accountKey.keyXdr)).toEqual({
      type: 'Account',
    })
    expect(decodeLedgerKeyInfo('malformed-key')).toEqual({ type: 'Other' })
  })
})
