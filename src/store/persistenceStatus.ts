const listeners = new Set<() => void>()
let snapshotPersistenceFailed = false

export function getSnapshotPersistenceFailed(): boolean {
  return snapshotPersistenceFailed
}

export function subscribeToSnapshotPersistence(
  listener: () => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setSnapshotPersistenceFailed(failed: boolean): void {
  if (snapshotPersistenceFailed === failed) return
  snapshotPersistenceFailed = failed
  for (const listener of listeners) listener()
}
