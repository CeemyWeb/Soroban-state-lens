import { describe, expect, it } from 'vitest'

import { formatStorageKeyPreview } from '../../lib/format/formatStorageKeyPreview'

import type { Node } from '../../types/node'

const symbol = (value: string): Node => ({
  kind: 'primitive',
  path: [],
  scType: 'symbol',
  value,
  raw: { switch: 'ScvSymbol', value },
})

describe('formatStorageKeyPreview', () => {
  it('renders a two-element vector key deterministically', () => {
    const key: Node = {
      kind: 'vec',
      path: [],
      items: [symbol('owner'), symbol('balance')],
      raw: { switch: 'ScvVec' },
    }

    expect(formatStorageKeyPreview(key)).toBe('[owner, balance]')
    expect(formatStorageKeyPreview(key)).toBe('[owner, balance]')
  })

  it('truncates vector keys containing long values', () => {
    const key: Node = {
      kind: 'vec',
      path: [],
      items: [symbol('x'.repeat(100)), symbol('balance')],
      raw: { switch: 'ScvVec' },
    }

    const preview = formatStorageKeyPreview(key)
    expect(preview).toHaveLength(64)
    expect(preview).toMatch(/^\[x{60}\.\.\.$/)
  })

  it('renders map entries and truncates long previews', () => {
    const key: Node = {
      kind: 'map',
      path: [],
      entries: [
        { key: symbol('a'.repeat(80)), value: symbol('b'.repeat(80)) },
        { key: symbol('second'), value: symbol('entry') },
        { key: symbol('ignored'), value: symbol('entry') },
      ],
      raw: { switch: 'ScvMap' },
    }

    const preview = formatStorageKeyPreview(key)
    expect(preview).toHaveLength(64)
    expect(preview).toMatch(/^\{a{60}\.\.\.$/)
  })
})
