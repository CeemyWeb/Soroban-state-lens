import {
  Account,
  BASE_FEE,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk'
import { buildJsonRpcRequest } from '../rpc/buildJsonRpcRequest'
import { isJsonRpcErrorResponse } from '../rpc/isJsonRpcErrorResponse'
import { isJsonRpcSuccessResponse } from '../rpc/isJsonRpcSuccessResponse'
import { toRpcRequestId } from '../rpc/toRpcRequestId'
import { simulateTransactionAdapter } from './simulateTransaction'
import type {
  SimulateTransactionResponse,
  SimulateTransactionResult,
} from './simulateTransaction'

export interface DiscoverContractKeysParams {
  rpcUrl: string
  networkPassphrase: string
  contractId: string
  sourceAccount: string
  functionName: string
  args: Array<unknown>
  signal: AbortSignal
}

interface SimulateRpcResult extends SimulateTransactionResponse {
  transactionData?: string
}

function decodeFootprint(transactionData: string | undefined) {
  if (!transactionData) {
    return { readOnly: [], readWrite: [] }
  }

  const resources = xdr.SorobanTransactionData.fromXDR(
    transactionData,
    'base64',
  ).resources()
  const footprint = resources.footprint()

  return {
    readOnly: footprint
      .readOnly()
      .map((key: { toXDR: (format: 'base64') => string }) =>
        key.toXDR('base64'),
      ),
    readWrite: footprint
      .readWrite()
      .map((key: { toXDR: (format: 'base64') => string }) =>
        key.toXDR('base64'),
      ),
  }
}

export async function discoverContractKeys({
  rpcUrl,
  networkPassphrase,
  contractId,
  sourceAccount,
  functionName,
  args,
  signal,
}: DiscoverContractKeysParams): Promise<SimulateTransactionResult> {
  if (signal.aborted) {
    throw new DOMException('Request was aborted', 'AbortError')
  }

  const transaction = new TransactionBuilder(new Account(sourceAccount, '0'), {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: functionName,
        args: args.map((arg) => nativeToScVal(arg)),
      }),
    )
    .setTimeout(30)
    .build()

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildJsonRpcRequest(
          'simulateTransaction',
          [{ transaction: transaction.toXDR() }],
          toRpcRequestId(),
        ),
      ),
      signal,
    })

    if (!response.ok) {
      return simulateTransactionAdapter({
        error: `HTTP ${response.status}: ${response.statusText}`,
      })
    }

    const data = (await response.json()) as unknown
    if (isJsonRpcErrorResponse(data)) {
      return simulateTransactionAdapter({
        error: `RPC Error (${data.error.code}): ${data.error.message}`,
      })
    }
    if (!isJsonRpcSuccessResponse(data)) {
      return simulateTransactionAdapter({ error: 'Invalid JSON-RPC response' })
    }

    const result = data.result as SimulateRpcResult
    return simulateTransactionAdapter({
      ...result,
      footprint: result.footprint ?? decodeFootprint(result.transactionData),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new DOMException('Request was aborted', 'AbortError')
    }
    throw error
  }
}
