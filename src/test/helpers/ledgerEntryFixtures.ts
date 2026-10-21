import { Address, xdr } from '@stellar/stellar-sdk'

export function createContractDataLedgerEntry(params: {
  contractSeed: number
  key: unknown
  value?: unknown
  durability?: 'persistent' | 'temporary'
}) {
  const {
    contractSeed,
    key,
    value = xdr.ScVal.scvSymbol('fixture-value'),
    durability = 'persistent',
  } = params
  const contractAddress = xdr.ScAddress.scAddressTypeContract(
    Buffer.alloc(32, contractSeed),
  )
  const contractId = Address.fromScVal(
    xdr.ScVal.scvAddress(contractAddress),
  ).toString()
  const keyDurability = xdr.ContractDataDurability[durability]()
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: contractAddress,
      key,
      durability: keyDurability,
    }),
  )
  const entryData = xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: new xdr.ExtensionPoint(0),
      contract: contractAddress,
      key,
      durability: keyDurability,
      val: value,
    }),
  )

  return {
    contractId,
    key: ledgerKey.toXDR('base64') as string,
    xdr: entryData.toXDR('base64') as string,
  }
}
