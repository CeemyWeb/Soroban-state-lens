import { describe, expect, it } from 'vitest'
import * as Comlink from 'comlink'
import { Address, xdr } from '@stellar/stellar-sdk'
import { decoderWorkerApi } from '../../workers/decoder.worker'
import { isDecoderWorkerError } from '../../types/decoder-worker'
import type { DecoderWorkerApi } from '../../types/decoder-worker'

async function decodeThroughComlink(
  xdrValue: ReturnType<typeof xdr.ScVal.fromXDR>,
  maxDepth?: number,
) {
  const { port1, port2 } = new MessageChannel()
  Comlink.expose(decoderWorkerApi, port1)
  const remote = Comlink.wrap<DecoderWorkerApi>(port2)

  try {
    return await remote.decodeScVal({
      xdr: xdrValue.toXDR('base64'),
      maxDepth,
    })
  } finally {
    port1.close()
    port2.close()
  }
}

describe('decoderWorkerApi.decodeScVal', () => {
  it('should decode a boolean ScVal', async () => {
    const scVal = xdr.ScVal.scvBool(true)
    const xdrString = scVal.toXDR('base64')

    const result = await decoderWorkerApi.decodeScVal({ xdr: xdrString })

    if (isDecoderWorkerError(result)) {
      throw new Error(`Expected success, got error: ${result.message}`)
    }

    expect(result.kind).toBe('primitive')
    if (result.kind === 'primitive') {
      expect(result.scType).toBe('bool')
      expect(result.value).toBe(true)
    }
  })

  it('should decode a u32 ScVal', async () => {
    const scVal = xdr.ScVal.scvU32(42)
    const xdrString = scVal.toXDR('base64')

    const result = await decoderWorkerApi.decodeScVal({ xdr: xdrString })

    if (isDecoderWorkerError(result)) {
      throw new Error(`Expected success, got error: ${result.message}`)
    }

    expect(result.kind).toBe('primitive')
    if (result.kind === 'primitive') {
      expect(result.scType).toBe('u32')
      expect(result.value).toBe(42)
    }
  })

  it('should return an error for invalid XDR', async () => {
    const result = await decoderWorkerApi.decodeScVal({ xdr: 'invalid-xdr' })

    expect(isDecoderWorkerError(result)).toBe(true)
    if (isDecoderWorkerError(result)) {
      expect(result.code).toBe('DECODE_FAILED')
    }
  })

  it('should respect maxDepth and truncate nested vec children', async () => {
    const scVal = xdr.ScVal.scvVec([
      xdr.ScVal.scvVec([xdr.ScVal.scvI32(1)]),
      xdr.ScVal.scvVec([xdr.ScVal.scvI32(2)]),
    ])
    const xdrString = scVal.toXDR('base64')

    const result = await decoderWorkerApi.decodeScVal({
      xdr: xdrString,
      maxDepth: 1,
    })

    if (isDecoderWorkerError(result)) {
      throw new Error(`Expected success, got error: ${result.message}`)
    }

    expect(result.kind).toBe('vec')
    if (result.kind !== 'vec') {
      throw new Error('Expected a vector node')
    }
    expect(result.items).toHaveLength(2)
    expect(result.items[0].kind).toBe('truncated')
    expect(result.items[1].kind).toBe('truncated')
    expect(result.items[0].path).toEqual([{ type: 'index', index: 0 }])
    expect(result.items[1].path).toEqual([{ type: 'index', index: 1 }])
  })

  it.each([
    ['account', Address.account(Buffer.alloc(32, 1))],
    ['contract', Address.contract(Buffer.alloc(32, 2))],
  ] as const)('preserves %s addresses through Comlink', async (_, address) => {
    const result = await decodeThroughComlink(address.toScVal())

    if (isDecoderWorkerError(result)) {
      throw new Error(`Expected success, got error: ${result.message}`)
    }

    expect(result.kind).toBe('address')
    if (result.kind === 'address') {
      expect(result.value).toBe(address.toString())
      expect(result.raw).toEqual({
        switch: 'ScvAddress',
        value: address.toString(),
      })
    }
    expect(() => structuredClone(result)).not.toThrow()
  })

  it('returns clone-safe truncated nested collections through Comlink', async () => {
    const scVal = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('nested'),
        val: xdr.ScVal.scvVec([xdr.ScVal.scvU32(42)]),
      }),
    ])
    const result = await decodeThroughComlink(scVal, 2)

    if (isDecoderWorkerError(result)) {
      throw new Error(`Expected success, got error: ${result.message}`)
    }

    expect(result.kind).toBe('map')
    if (result.kind === 'map') {
      const nestedValue = result.entries[0].value
      expect(nestedValue.kind).toBe('vec')
      if (nestedValue.kind === 'vec') {
        expect(nestedValue.items[0]).toMatchObject({
          kind: 'truncated',
          depth: 2,
          path: [
            { type: 'key', key: { kind: 'primitive', value: 'nested' } },
            { type: 'index', index: 0 },
          ],
        })
      }
    }
    expect(() => structuredClone(result)).not.toThrow()
  })
})
