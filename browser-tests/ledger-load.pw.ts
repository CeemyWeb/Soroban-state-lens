import { expect, test } from '@playwright/test'
import { Address, xdr } from '@stellar/stellar-sdk'

function createContractDataFixture(
  durability: 'persistent' | 'temporary',
  value: ReturnType<typeof xdr.ScVal.scvVoid>,
) {
  const contractBytes = new Uint8Array(32).fill(1)
  const contract = xdr.ScAddress.scAddressTypeContract(contractBytes)
  const key = xdr.ScVal.scvSymbol(`fixture-${durability}`)
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract,
      key,
      durability: xdr.ContractDataDurability[durability](),
    }),
  )
  const entryData = xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: new xdr.ExtensionPoint(0),
      contract,
      key,
      durability: xdr.ContractDataDurability[durability](),
      val: value,
    }),
  )

  return {
    key: ledgerKey.toXDR('base64'),
    xdr: entryData.toXDR('base64'),
    contractId: Address.contract(contractBytes).toString(),
  }
}

test('browser: loads real persistent and temporary contract-data envelopes through the worker', async ({
  page,
}) => {
  const persistent = createContractDataFixture(
    'persistent',
    xdr.ScVal.scvVec([xdr.ScVal.scvU32(7), xdr.ScVal.scvString('nested')]),
  )
  const temporary = createContractDataFixture(
    'temporary',
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('answer'),
        val: xdr.ScVal.scvU32(42),
      }),
    ]),
  )
  const entries = [
    {
      key: persistent.key,
      xdr: persistent.xdr,
      lastModifiedLedgerSeq: 101,
    },
    {
      key: temporary.key,
      xdr: temporary.xdr,
      lastModifiedLedgerSeq: 102,
      liveUntilLedgerSeq: 200,
    },
  ]

  await page.route('https://rpc-futurenet.stellar.org/**', async (route) => {
    const request = route.request().postDataJSON()
    if (request.method === 'getLatestLedger') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: { sequence: 103 },
        }),
      })
      return
    }

    expect(request.method).toBe('getLedgerEntries')
    expect(request.params).toEqual({ keys: [persistent.key, temporary.key] })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: { entries, latestLedger: 103 },
      }),
    })
  })

  await page.goto(
    `/contracts/${persistent.contractId}/explorer?keys=${encodeURIComponent(
      `${persistent.key},${temporary.key}`,
    )}`,
  )
  await expect(page.getByText('Explorer Rows (2)')).toBeVisible()
  await expect(page.getByText('Persistent', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Temporary', { exact: true })).toHaveCount(1)
  await expect(page.getByText('2 items')).toBeVisible()
  await expect(page.getByText('1 entries')).toBeVisible()
})
