import * as Comlink from 'comlink'
import { Address, xdr } from '@stellar/stellar-sdk'
import { normalizeScAddress, normalizeScVal } from './decoder/normalizeScVal'
import { ScValType, normalizeNode } from './decoder/normalizeNode'
import type { ScVal as PlainScVal } from './decoder/normalizeNode'
import type {
  DecodeScValRequest,
  DecodeScValResult,
  DecoderWorkerApi,
  DecoderWorkerError,
  NormalizeRequest,
  NormalizeResult,
  PingResponse,
} from '../types/decoder-worker'

function cloneSafeXdrValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value)
  }
  if (Array.isArray(value)) {
    return value.map(cloneSafeXdrValue)
  }

  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'function') {
      result[key] = cloneSafeXdrValue(item)
    }
  }
  return result
}

function toPlainScVal(scVal: ReturnType<typeof xdr.ScVal.fromXDR>): PlainScVal {
  const switchName = scVal.switch().name
  const normalizedSwitch = (switchName.charAt(0).toUpperCase() +
    switchName.slice(1)) as ScValType
  const value = scVal.value()

  switch (normalizedSwitch) {
    case ScValType.SCV_VEC:
      return {
        switch: normalizedSwitch,
        value: Array.isArray(value)
          ? value.map((item) => toPlainScVal(item))
          : value,
      }
    case ScValType.SCV_MAP:
      return {
        switch: normalizedSwitch,
        value: Array.isArray(value)
          ? value.map((entry) => ({
              key: toPlainScVal(entry.key()),
              val: toPlainScVal(entry.val()),
            }))
          : value,
      }
    case ScValType.SCV_ADDRESS:
      return {
        switch: normalizedSwitch,
        value: Address.fromScVal(scVal).toString(),
      }
    case ScValType.SCV_STRING:
    case ScValType.SCV_SYMBOL:
      return {
        switch: normalizedSwitch,
        value: typeof value === 'string' ? value : value?.toString(),
      }
    case ScValType.SCV_U64:
    case ScValType.SCV_I64:
      return { switch: normalizedSwitch, value: value?.toString() }
    case ScValType.SCV_U128:
    case ScValType.SCV_I128: {
      const parts = value as {
        hi: () => { toString: () => string }
        lo: () => { toString: () => string }
      }
      return {
        switch: normalizedSwitch,
        value: {
          hi: parts.hi().toString(),
          lo: parts.lo().toString(),
        },
      }
    }
    case ScValType.SCV_U256:
    case ScValType.SCV_I256: {
      const parts = value as {
        hiHi: () => { toString: () => string }
        hiLo: () => { toString: () => string }
        loHi: () => { toString: () => string }
        loLo: () => { toString: () => string }
      }
      return {
        switch: normalizedSwitch,
        value: {
          hiHi: parts.hiHi().toString(),
          hiLo: parts.hiLo().toString(),
          loHi: parts.loHi().toString(),
          loLo: parts.loLo().toString(),
        },
      }
    }
    default:
      return {
        switch: normalizedSwitch,
        value: cloneSafeXdrValue(value),
      }
  }
}

/**
 * Implements the typed decoder worker API.
 * All methods conform to the DecoderWorkerApi contract defined in types/decoder-worker.ts
 */
export const decoderWorkerApi: DecoderWorkerApi = {
  ping(): Promise<PingResponse> {
    return Promise.resolve({ status: 'pong' })
  },

  normalize(request: NormalizeRequest): Promise<NormalizeResult> {
    try {
      const { scVal, asAddress = false, maxDepth } = request

      // Normalize as address if requested and applicable
      if (asAddress) {
        const normalizedAddress = normalizeScAddress(scVal)
        return Promise.resolve({
          type: 'address',
          value: normalizedAddress,
        })
      }

      // Default: normalize as value
      const normalizedValue = normalizeScVal(scVal, undefined, { maxDepth })
      return Promise.resolve({
        type: 'value',
        value: normalizedValue,
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const errorDetails: Record<string, unknown> = {}

      if (error instanceof Error) {
        errorDetails.stack = error.stack
        errorDetails.name = error.name
      }

      const workerError: DecoderWorkerError = {
        code: 'NORMALIZE_FAILED',
        message: `Failed to normalize ScVal: ${errorMessage}`,
        details: errorDetails,
      }

      return Promise.resolve(workerError)
    }
  },

  decodeScVal(request: DecodeScValRequest): Promise<DecodeScValResult> {
    try {
      const { xdr: xdrString, maxDepth } = request

      // Decode the XDR into plain data before normalization so nested SDK
      // objects never cross the worker boundary.
      const scValXdr = xdr.ScVal.fromXDR(xdrString, 'base64')
      const plainScVal = toPlainScVal(scValXdr)

      // Perform full node normalization with optional depth limiting
      const normalizedNode = normalizeNode(plainScVal, undefined, undefined, {
        maxDepth,
      })

      return Promise.resolve(normalizedNode)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const errorDetails: Record<string, unknown> = {}

      if (error instanceof Error) {
        errorDetails.stack = error.stack
        errorDetails.name = error.name
      }

      const workerError: DecoderWorkerError = {
        code: 'DECODE_FAILED',
        message: `Failed to decode ScVal XDR: ${errorMessage}`,
        details: errorDetails,
      }

      return Promise.resolve(workerError)
    }
  },
}

// Expose the fully typed API through Comlink
Comlink.expose(decoderWorkerApi)
