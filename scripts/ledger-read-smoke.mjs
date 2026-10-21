import { pathToFileURL } from 'node:url'

export async function runLedgerReadSmoke(
  rpcUrl,
  presentKey,
  absentKey,
  fetchImpl = fetch,
) {
  if (
    typeof rpcUrl !== 'string' ||
    rpcUrl.trim() === '' ||
    typeof presentKey !== 'string' ||
    presentKey.trim() === '' ||
    typeof absentKey !== 'string' ||
    absentKey.trim() === '' ||
    presentKey === absentKey
  ) {
    throw new Error(
      'Expected an RPC URL, a present LedgerKey XDR, and a distinct absent LedgerKey XDR',
    )
  }

  const ledgerEntriesResponse = await requestRpcWith(
    fetchImpl,
    rpcUrl,
    'getLedgerEntries',
    { keys: [presentKey, absentKey] },
  )

  if (!Array.isArray(ledgerEntriesResponse?.entries)) {
    throw new Error('getLedgerEntries returned an invalid entries field')
  }

  const keysFound = new Set(
    ledgerEntriesResponse.entries.map((entry) => entry?.key),
  )
  if (!keysFound.has(presentKey)) {
    throw new Error('The supplied present key was not returned')
  }
  if (keysFound.has(absentKey)) {
    throw new Error('The supplied absent key was returned')
  }
  if (
    typeof ledgerEntriesResponse.latestLedger !== 'number' ||
    !Number.isFinite(ledgerEntriesResponse.latestLedger)
  ) {
    throw new Error('getLedgerEntries returned an invalid latestLedger')
  }

  return {
    foundPresentKey: true,
    absentKeyNotFound: true,
    latestLedger: ledgerEntriesResponse.latestLedger,
  }
}

async function requestRpcWith(fetchImpl, rpcUrl, method, params) {
  const response = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.error) {
    throw new Error(
      `RPC Error (${payload.error.code}): ${payload.error.message}`,
    )
  }
  if (payload?.jsonrpc !== '2.0' || !('result' in payload)) {
    throw new Error(`Invalid ${method} JSON-RPC response`)
  }

  return payload.result
}

async function main() {
  const [rpcUrl, presentKey, absentKey] = process.argv.slice(2)
  if (!rpcUrl || !presentKey || !absentKey) {
    throw new Error(
      'Usage: npm run smoke:ledger-read -- <rpc-url> <present-ledger-key-xdr> <absent-ledger-key-xdr>',
    )
  }

  const result = await runLedgerReadSmoke(rpcUrl, presentKey, absentKey)
  console.log(
    `Ledger read smoke passed at ledger ${result.latestLedger}: present key found, absent key omitted.`,
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
