export function normalizeNetworkScopeId(networkId: string): string {
  return typeof networkId === 'string' && networkId.trim().length > 0
    ? networkId.trim().toLowerCase()
    : 'custom'
}
