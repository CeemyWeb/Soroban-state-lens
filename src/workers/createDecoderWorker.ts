import * as Comlink from 'comlink'

import type { DecoderWorkerApi } from '../types/decoder-worker'

export interface DecoderWorkerClient extends DecoderWorkerApi {
  terminate: () => void
}

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

  return {
    ping: () => remote.ping(),
    normalize: (request) => remote.normalize(request),
    decodeScVal: (request) => remote.decodeScVal(request),
    terminate: () => {
      if (terminated) {
        return
      }
      terminated = true
      remote[Comlink.releaseProxy]()
      worker.terminate()
    },
  }
}
