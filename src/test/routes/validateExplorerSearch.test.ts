import { describe, expect, it } from 'vitest'
import { validateExplorerSearch } from '../../routes/contracts/$contractId/-validateExplorerSearch'

describe('validateExplorerSearch', () => {
  it('accepts the explicit demo mode marker', () => {
    expect(
      validateExplorerSearch({ mode: 'demo', keys: 'counter-key' }),
    ).toEqual({ mode: 'demo', keys: 'counter-key' })
  })

  it('keeps other mode values in live mode and drops invalid keys', () => {
    expect(validateExplorerSearch({ mode: 'other', keys: 42 })).toEqual({
      mode: 'live',
      keys: '',
    })
  })
})
