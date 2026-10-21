import { describe, expect, it } from 'vitest'
import { parseCustomSectionName } from '../lib/decoder/sectionValidator'

describe('parseCustomSectionName', () => {
  it('parses valid UTF-8 section names', () => {
    const validBytes = new TextEncoder().encode('custom_section_valid')
    expect(parseCustomSectionName(validBytes)).toBe('custom_section_valid')
  })

  it('throws for malformed UTF-8 bytes', () => {
    const malformedBytes = new Uint8Array([0x63, 0x75, 0x73, 0x74, 0x6f, 0xff])
    expect(() => parseCustomSectionName(malformedBytes)).toThrowError(
      'Malformed UTF-8 in custom section name',
    )
  })
})
