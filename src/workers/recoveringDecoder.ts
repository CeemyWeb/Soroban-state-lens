import {
  isDecoderWorkerError,
  limitDecoderErrorDetail,
} from '../types/decoder-worker'
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
    reason: limitDecoderErrorDetail(error.message),
  }
}

export class RecoveringDecoder {
  private worker: DecoderWorkerClient | null = null
  private readonly terminatedWorkers = new WeakSet<DecoderWorkerClient>()
  private readonly abortController = new AbortController()
  private terminated = false

  constructor(
    private readonly createWorker: () => Promise<DecoderWorkerClient> = createDecoderWorkerSafe,
    private readonly timeoutMs: number = DEFAULT_DECODE_TIMEOUT_MS,
  ) {}

  async decodeScVal(xdr: string): Promise<DecodeScValResult> {
    if (this.terminated) {
      return {
        code: 'DECODE_WORKER_FAILED',
        message: 'Decoder has been terminated',
      }
    }

    let worker: DecoderWorkerClient | null = null
    try {
      this.worker ??= await this.createWorker()
      const activeWorker = this.worker
      worker = activeWorker
      const result = await withDecodeTimeout<DecodeScValResult>(
        activeWorker.decodeScVal({ xdr }).then((value) => value),
        () => this.dispose(activeWorker),
        this.timeoutMs,
        this.abortController.signal,
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
    if (this.terminated) return
    this.terminated = true
    this.abortController.abort(new Error('Decoder worker was terminated'))
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
