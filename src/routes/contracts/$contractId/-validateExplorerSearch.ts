export interface ExplorerSearch {
  keys: string
  mode: 'demo' | 'live'
}

export function validateExplorerSearch(
  search: Record<string, unknown>,
): ExplorerSearch {
  return {
    keys: typeof search.keys === 'string' ? search.keys : '',
    mode: search.mode === 'demo' ? 'demo' : 'live',
  }
}
