import { Address, xdr } from '@stellar/stellar-sdk'

export function makeContractDataFixture(
  label = 'counter',
  value = xdr.ScVal.scvU32(42),
  durabilityName: 'persistent' | 'temporary' = 'persistent',
) {
  const contract = xdr.ScAddress.scAddressTypeContract(Buffer.alloc(32))
  const key = xdr.ScVal.scvSymbol(label)
  const durability = xdr.ContractDataDurability[durabilityName]()
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({ contract, key, durability }),
  )
  const ledgerEntryData = xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: new xdr.ExtensionPoint(0),
      contract,
      key,
      durability,
      val: value,
    }),
  )

  return {
    contractId: Address.fromScVal(xdr.ScVal.scvAddress(contract)).toString(),
    keyXdr: ledgerKey.toXDR('base64'),
    entryXdr: ledgerEntryData.toXDR('base64'),
    valueXdr: value.toXDR('base64'),
  }
}

export function makeContractCodeFixture() {
  const hash = Buffer.alloc(32, 1)
  const ledgerKey = xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({ hash }),
  )
  const ledgerEntryData = xdr.LedgerEntryData.contractCode(
    new xdr.ContractCodeEntry({
      ext: new xdr.ContractCodeEntryExt(0),
      hash,
      code: Buffer.from([1]),
    }),
  )

  return {
    keyXdr: ledgerKey.toXDR('base64'),
    entryXdr: ledgerEntryData.toXDR('base64'),
  }
}

export function makeAccountFixture() {
  const accountId = xdr.AccountId.publicKeyTypeEd25519(Buffer.alloc(32))
  const ledgerKey = xdr.LedgerKey.account(
    new xdr.LedgerKeyAccount({ accountId }),
  )
  const account = new xdr.AccountEntry({
    accountId,
    balance: xdr.Int64.fromString('100'),
    seqNum: xdr.SequenceNumber.fromString('1'),
    numSubEntries: 0,
    inflationDest: null,
    flags: 0,
    homeDomain: '',
    thresholds: Buffer.alloc(4),
    signers: [],
    ext: new xdr.AccountEntryExt(0),
  })
  const ledgerEntryData = xdr.LedgerEntryData.account(account)

  return {
    keyXdr: ledgerKey.toXDR('base64'),
    entryXdr: ledgerEntryData.toXDR('base64'),
  }
}
