import { describe, expect, it } from 'vitest'
import { formatScIntegerByPreference } from '../../lib/format/formatScIntegerByPreference'
import { BigIntDisplayMode } from '../../store/types'

describe('formatScIntegerByPreference', () => {
  it('preserves decimal values', () => {
    expect(
      formatScIntegerByPreference('-12345', BigIntDisplayMode.DECIMAL),
    ).toBe('-12345')
  })

  it('formats signed and unsigned values as hex', () => {
    expect(formatScIntegerByPreference('-42', BigIntDisplayMode.HEX)).toBe(
      '-0x2a',
    )
    expect(formatScIntegerByPreference('42', BigIntDisplayMode.HEX)).toBe(
      '0x2a',
    )
  })

  it('formats large signed and unsigned values without numeric precision loss', () => {
    expect(
      formatScIntegerByPreference('-12345', BigIntDisplayMode.SCIENTIFIC),
    ).toBe('-1.2345e+4')
    expect(
      formatScIntegerByPreference(
        '100000000000000000000',
        BigIntDisplayMode.SCIENTIFIC,
      ),
    ).toBe('1.00000000000000000000e+20')
  })
})
