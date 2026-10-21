import { describe, expect, it } from 'vitest'
import { compareContractSchema } from '../../lib/spec/compareContractSchema'

describe('compareContractSchema', () => {
  it('returns no diagnostics when key paths and types match', () => {
    expect(
      compareContractSchema(
        [
          { keyPath: 'balance', type: 'i128' },
          { keyPath: 'owner', type: 'Address' },
        ],
        [
          { keyPath: 'balance', type: 'i128' },
          { keyPath: 'owner', type: 'Address' },
        ],
      ),
    ).toEqual([])
  })

  it('reports type changes and missing fields in stable key-path order', () => {
    expect(
      compareContractSchema(
        [
          { keyPath: 'balance', type: 'i128' },
          { keyPath: 'owner', type: 'Address' },
        ],
        [
          { keyPath: 'balance', type: 'symbol' },
          { keyPath: 'supply', type: 'i128' },
        ],
      ),
    ).toEqual([
      { keyPath: 'balance', expectedType: 'i128', actualType: 'symbol' },
      { keyPath: 'owner', expectedType: 'Address', actualType: '<missing>' },
      { keyPath: 'supply', expectedType: '<missing>', actualType: 'i128' },
    ])
  })
})
