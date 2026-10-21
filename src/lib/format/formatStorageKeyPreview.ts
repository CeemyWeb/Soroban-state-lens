import { formatScBytesHex } from './formatScBytesHex'
import { formatScSymbol } from './formatScSymbol'
import { formatContractIdShort } from './formatContractIdShort'

import type { Node } from '../../types/node'

const MAX_PREVIEW_LENGTH = 64
const MAX_COLLECTION_ITEMS = 2
const MAX_PREVIEW_DEPTH = 3

function shorten(value: string): string {
  if (value.length <= MAX_PREVIEW_LENGTH) {
    return value
  }
  return `${value.slice(0, MAX_PREVIEW_LENGTH - 3)}...`
}

function formatNode(node: Node, depth: number): string {
  if (depth >= MAX_PREVIEW_DEPTH) {
    return '...'
  }

  switch (node.kind) {
    case 'primitive':
      if (node.scType === 'symbol' && typeof node.value === 'string') {
        return formatScSymbol(node.value)
      }
      if (node.scType === 'string' && typeof node.value === 'string') {
        return JSON.stringify(node.value)
      }
      return String(node.value)
    case 'address':
      return formatContractIdShort(node.value)
    case 'vec': {
      const items = node.items
        .slice(0, MAX_COLLECTION_ITEMS)
        .map((item) => formatNode(item, depth + 1))
      if (node.items.length > MAX_COLLECTION_ITEMS) {
        items.push('...')
      }
      return `[${items.join(', ')}]`
    }
    case 'map': {
      const entries = node.entries
        .slice(0, MAX_COLLECTION_ITEMS)
        .map(
          ({ key, value }) =>
            `${formatNode(key, depth + 1)}: ${formatNode(value, depth + 1)}`,
        )
      if (node.entries.length > MAX_COLLECTION_ITEMS) {
        entries.push('...')
      }
      return `{${entries.join(', ')}}`
    }
    case 'error':
      return `${node.errorType}:${node.code}`
    case 'unsupported': {
      const rawValue = node.raw.value
      const numberArray = Array.isArray(rawValue)
        ? rawValue.every((value): value is number => typeof value === 'number')
          ? rawValue
          : undefined
        : undefined
      if (node.variant === 'ScvBytes') {
        if (rawValue instanceof Uint8Array || typeof rawValue === 'string') {
          return formatScBytesHex(rawValue)
        }
        if (numberArray !== undefined) {
          return formatScBytesHex(numberArray)
        }
      }
      return node.variant
    }
    case 'truncated':
    case 'cycle':
      return '...'
  }
}

/**
 * Creates a deterministic, bounded label for an ScVal storage key.
 */
export function formatStorageKeyPreview(node: Node): string {
  return shorten(formatNode(node, 0))
}
