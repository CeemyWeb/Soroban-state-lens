import { BigIntDisplayMode } from '../../store/types'

export function formatScIntegerByPreference(
  value: string | number,
  preference: BigIntDisplayMode,
): string {
  const text = String(value)
  switch (preference) {
    case BigIntDisplayMode.DECIMAL:
      return text
    case BigIntDisplayMode.HEX:
    case BigIntDisplayMode.SCIENTIFIC: {
      let integer: bigint
      try {
        integer = BigInt(text)
      } catch {
        return text
      }

      if (preference === BigIntDisplayMode.HEX) {
        const sign = integer < 0n ? '-0x' : '0x'
        return `${sign}${(integer < 0n ? -integer : integer).toString(16)}`
      }

      if (integer === 0n) {
        return text
      }

      const sign = integer < 0n ? '-' : ''
      const digits = (integer < 0n ? -integer : integer).toString()
      const significand =
        digits.length === 1 ? digits : `${digits[0]}.${digits.slice(1)}`
      return `${sign}${significand}e+${digits.length - 1}`
    }
    default:
      return text
  }
}
