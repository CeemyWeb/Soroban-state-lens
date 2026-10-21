import * as Comlink from 'comlink'

import type { DecoderWorkerApi } from '../types/decoder-worker'

export type DecoderWorkerClient = DecoderWorkerApi & {
  terminate: () => void
}

const workersByClient = new WeakMap<object, Worker>()

/**
 * Creates and returns a typed remote worker for decoder operations.
 * The returned worker conforms to the DecoderWorkerApi contract.
 *
 * @returns A Comlink-wrapped remote worker typed to DecoderWorkerApi
 */
export function createDecoderWorker(): DecoderWorkerClient {
  const worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), {
    type: 'module',
  })
  const remote = Comlink.wrap<DecoderWorkerApi>(worker)
  let terminated = false

  const decoder: DecoderWorkerClient = {
    ping: () => remote.ping(),
    normalize: (request) => remote.normalize(request),
    decodeScVal: (request) => remote.decodeScVal(request),
    terminate: () => {
      if (terminated) return
      terminated = true
      terminateDecoderWorker(decoder)
    },
  }
  workersByClient.set(decoder, worker)
  return decoder
}

export function terminateDecoderWorker(decoder: DecoderWorkerClient): void {
  const worker = workersByClient.get(decoder)
  if (worker) {
    workersByClient.delete(decoder)
    worker.terminate()
  }
}
