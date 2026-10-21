import * as Comlink from 'comlink'

import type { DecoderWorkerApi } from '../types/decoder-worker'

const workersByProxy = new WeakMap<object, Worker>()

/**
 * Creates and returns a typed remote worker for decoder operations.
 * The returned worker conforms to the DecoderWorkerApi contract.
 *
 * @returns A Comlink-wrapped remote worker typed to DecoderWorkerApi
 */
export function createDecoderWorker(): Comlink.Remote<DecoderWorkerApi> {
  const worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), {
    type: 'module',
  })

  const decoder = Comlink.wrap<DecoderWorkerApi>(worker)
  workersByProxy.set(decoder, worker)
  return decoder
}

export function terminateDecoderWorker(
  decoder: Comlink.Remote<DecoderWorkerApi>,
): void {
  const worker = workersByProxy.get(decoder)
  if (worker) {
    workersByProxy.delete(decoder)
    worker.terminate()
  }
}
