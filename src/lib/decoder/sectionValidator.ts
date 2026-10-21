/** Rejects custom section names that contain malformed UTF-8. */
export function parseCustomSectionName(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Malformed UTF-8 in custom section name')
  }
}
