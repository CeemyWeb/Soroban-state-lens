import type { GetLedgerEntriesResult } from '../../../lib/network/getLedgerEntries'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates a serialized getLedgerEntries request before returning its fixture.
 */
export function ledgerResponseFixture(
  serializedRequest: string,
  expectedKeys: Array<string>,
  result: GetLedgerEntriesResult,
): {
  jsonrpc: '2.0'
  id: number
  result: GetLedgerEntriesResult
} {
  const request: unknown = JSON.parse(serializedRequest)
  if (
    !isRecord(request) ||
    request.jsonrpc !== '2.0' ||
    request.method !== 'getLedgerEntries' ||
    typeof request.id !== 'number' ||
    !Number.isSafeInteger(request.id) ||
    !isRecord(request.params) ||
    !Array.isArray(request.params.keys) ||
    request.params.keys.some((key) => typeof key !== 'string') ||
    JSON.stringify(request.params.keys) !== JSON.stringify(expectedKeys)
  ) {
    throw new Error(
      'Ledger response fixture requires getLedgerEntries params with the expected named keys',
    )
  }

  return {
    jsonrpc: '2.0',
    id: request.id,
    result,
  }
}
