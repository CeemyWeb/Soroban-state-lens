import { isDecoderWorkerError } from '../types/decoder-worker'
import { createDecoderWorkerSafe } from './createDecoderWorkerSafe'
import {
  DEFAULT_DECODE_TIMEOUT_MS,
  withDecodeTimeout,
} from './withDecodeTimeout'

import type {
  DecodeScValResult,
  DecoderWorkerError,
} from '../types/decoder-worker'
import type { DecoderWorkerClient } from './createDecoderWorker'

export interface RawXdrFallback {
  kind: 'raw-xdr'
  xdr: string
  reason?: string
}

export function toRawXdrFallback(
  xdr: string,
  error: DecoderWorkerError,
): RawXdrFallback {
  return {
    kind: 'raw-xdr',
    xdr,
    ...(error.code === 'DECODE_TIMEOUT' || error.code === 'DECODE_WORKER_FAILED'
      ? { reason: error.message }
      : {}),
  }
}

export class RecoveringDecoder {
  private worker: DecoderWorkerClient | null = null
  private readonly terminatedWorkers = new WeakSet<DecoderWorkerClient>()

  constructor(
    private readonly createWorker: () => Promise<DecoderWorkerClient> = createDecoderWorkerSafe,
    private readonly timeoutMs: number = DEFAULT_DECODE_TIMEOUT_MS,
  ) {}

  async decodeScVal(xdr: string): Promise<DecodeScValResult> {
    let worker: DecoderWorkerClient | null = null
    try {
      this.worker ??= await this.createWorker()
      const activeWorker = this.worker
      worker = activeWorker
      const result = await withDecodeTimeout<DecodeScValResult>(
        activeWorker.decodeScVal({ xdr }).then((value) => value),
        () => this.dispose(activeWorker),
        this.timeoutMs,
      )

      if (
        isDecoderWorkerError(result) &&
        result.code === 'DECODE_WORKER_FAILED'
      ) {
        this.dispose(activeWorker)
      }

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const timedOut =
        error instanceof Error &&
        error.message.startsWith('Decoder worker timed out after ')
      if (worker) {
        this.dispose(worker)
      }

      return {
        code: timedOut ? 'DECODE_TIMEOUT' : 'DECODE_WORKER_FAILED',
        message: timedOut
          ? message
          : `Decoder worker communication failed: ${message}`,
      }
    }
  }

  terminate(): void {
    const worker = this.worker
    this.worker = null
    if (worker) {
      this.dispose(worker)
    }
  }

  private dispose(worker: DecoderWorkerClient): void {
    if (this.terminatedWorkers.has(worker)) {
      return
    }
    this.terminatedWorkers.add(worker)
    if (this.worker === worker) {
      this.worker = null
    }
    worker.terminate()
  }
}
