import { describe, it, expect } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  DEFAULT_BUDGETS,
  BUDGET_MATCHERS,
  buildSizeReport,
  assetsFromManifest,
  readAssetsFromDist,
  formatReport,
} from '../../../scripts/check-bundle-size.mjs'

function makeSizeLookup(map) {
  return (file) => {
    if (!(file in map)) throw new Error(`Unknown file ${file}`)
    return map[file]
  }
}

describe('bundle-size budget checker', () => {
  it('records exact bytes for the decoder worker and stellar-sdk chunks', () => {
    const assets = [
      'assets/decoder-worker-abc123.js',
      'assets/stellar-sdk-def456.js',
      'assets/index-ghi789.js',
    ]
    const sizes = {
      'assets/decoder-worker-abc123.js': 1034 * 1024,
      'assets/stellar-sdk-def456.js': 1013 * 1024,
      'assets/index-ghi789.js': 123,
    }

    const result = buildSizeReport(assets, makeSizeLookup(sizes))

    expect(result.ok).toBe(true)
    expect(result.exceeded).toHaveLength(0)

    const worker = result.report.find((e) => e.budget === 'decoderWorker')
    expect(worker).toBeDefined()
    expect(worker.matched).toBe(true)
    expect(worker.totalBytes).toBe(1034 * 1024)
    expect(worker.files).toHaveLength(1)
    expect(worker.files[0].bytes).toBe(1034 * 1024)

    const sdk = result.report.find((e) => e.budget === 'stellarSdk')
    expect(sdk).toBeDefined()
    expect(sdk.matched).toBe(true)
    expect(sdk.totalBytes).toBe(1013 * 1024)
  })

  it('fails only when a configured budget is exceeded', () => {
    const assets = ['assets/decoder-worker-abc123.js']
    const oversized = DEFAULT_BUDGETS.decoderWorker + 1
    const result = buildSizeReport(assets, () => oversized)

    expect(result.ok).toBe(false)
    expect(result.exceeded).toHaveLength(1)
    expect(result.exceeded[0].budget).toBe('decoderWorker')
    expect(result.exceeded[0].totalBytes).toBe(oversized)
  })

  it('passes at exactly the budget boundary', () => {
    const assets = ['assets/stellar-sdk-def456.js']
    const result = buildSizeReport(assets, () => DEFAULT_BUDGETS.stellarSdk)

    expect(result.ok).toBe(true)
    expect(
      result.report.find((e) => e.budget === 'stellarSdk').totalBytes,
    ).toBe(DEFAULT_BUDGETS.stellarSdk)
  })

  it('reports unmatched budgets without failing', () => {
    const result = buildSizeReport([], () => 0)

    expect(result.ok).toBe(true)
    expect(result.report).toHaveLength(2)
    for (const entry of result.report) {
      expect(entry.matched).toBe(false)
      expect(entry.totalBytes).toBe(0)
    }
  })

  it('matchers target the decoder worker and stellar-sdk chunks only', () => {
    expect(
      BUDGET_MATCHERS.decoderWorker('assets/decoder-worker-abc123.js'),
    ).toBe(true)
    expect(
      BUDGET_MATCHERS.decoderWorker('assets/decoder.worker-abc123.js'),
    ).toBe(true)
    expect(BUDGET_MATCHERS.decoderWorker('assets/index-ghi789.js')).toBe(false)
    expect(BUDGET_MATCHERS.stellarSdk('assets/stellar-sdk-def456.js')).toBe(
      true,
    )
    expect(BUDGET_MATCHERS.stellarSdk('assets/react-abc123.js')).toBe(false)
  })

  it('reads assets from a Vite manifest', () => {
    const manifest = {
      'src/main.tsx': {
        file: 'assets/index-ghi789.js',
        css: ['assets/index-adc123.css'],
      },
      'src/workers/decoder/worker.ts': {
        file: 'assets/decoder-worker-abc123.js',
      },
      'node_modules/@stellar/stellar-sdk': {
        file: 'assets/stellar-sdk-def456.js',
      },
    }
    const assets = assetsFromManifest(manifest)
    expect(assets).toContain('assets/decoder-worker-abc123.js')
    expect(assets).toContain('assets/stellar-sdk-def456.js')
    expect(assets).toContain('assets/index-adc123.css')
    expect(new Set(assets).size).toBe(assets.length)
  })

  it('reads assets from dist and measures exact bytes on disk', () => {
    const distDir = mkdtempSync(join(tmpdir(), 'bundle-size-'))
    try {
      mkdirSync(join(distDir, 'assets'), { recursive: true })
      const workerPath = join(distDir, 'assets', 'decoder-worker-abc123.js')
      const sdkPath = join(distDir, 'assets', 'stellar-sdk-def456.js')
      writeFileSync(
        join(distDir, 'manifest.json'),
        JSON.stringify({ name: 'app' }),
      )
      writeFileSync(workerPath, Buffer.alloc(1024))
      writeFileSync(sdkPath, Buffer.alloc(2048))

      const assets = readAssetsFromDist(distDir)
      expect(assets).toContain('assets/decoder-worker-abc123.js')
      expect(assets).toContain('assets/stellar-sdk-def456.js')

      const result = buildSizeReport(
        assets,
        (rel) => statSync(join(distDir, rel)).size,
      )
      expect(result.ok).toBe(true)
      const worker = result.report.find((e) => e.budget === 'decoderWorker')
      expect(worker.totalBytes).toBe(1024)
    } finally {
      rmSync(distDir, { recursive: true, force: true })
    }
  })

  it('formats a report that includes exact bytes and exceeded budgets', () => {
    const assets = ['assets/decoder-worker-abc123.js']
    const result = buildSizeReport(
      assets,
      () => DEFAULT_BUDGETS.decoderWorker + 10,
    )
    const text = formatReport(result)
    expect(text).toContain('decoderWorker')
    expect(text).toContain('EXCEEDED')
    expect(text).toContain(String(DEFAULT_BUDGETS.decoderWorker + 10))
  })
})
