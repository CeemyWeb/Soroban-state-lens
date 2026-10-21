import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { stop as stopEsbuild } from 'esbuild'
import { chromium } from 'playwright'
import { xdr } from '@stellar/stellar-sdk'
import { build, preview } from 'vite'

let server
let browser

try {
  await build({
    configFile: false,
    root: resolve('.'),
    build: {
      rollupOptions: {
        input: resolve('test/browser/decoder-worker.html'),
      },
    },
  })

  server = await preview({
    configFile: false,
    root: resolve('.'),
    preview: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
  })
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('Vite preview did not expose a local HTTP address')
  }

  const browserChannel =
    process.env.PLAYWRIGHT_CHANNEL ??
    (process.platform === 'win32' &&
    existsSync(
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    )
      ? 'msedge'
      : undefined)
  browser = await chromium.launch(
    browserChannel ? { channel: browserChannel } : {},
  )

  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
    console.error(`Browser page error: ${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.error(`Browser console error: ${message.text()}`)
    }
  })
  page.on('requestfailed', (request) => {
    console.error(
      `Browser request failed: ${request.url()} (${request.failure()?.errorText})`,
    )
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      console.error(
        `Browser response failed: ${response.status()} ${response.url()}`,
      )
    }
  })

  const scalarXdr = xdr.ScVal.scvU32(42).toXDR('base64')
  await page.goto(
    `http://127.0.0.1:${address.port}/test/browser/decoder-worker.html?xdr=${encodeURIComponent(scalarXdr)}`,
  )
  try {
    await page.waitForFunction(
      () => {
        const status = document
          .querySelector('#worker-result')
          ?.getAttribute('data-status')
        return status === 'complete' || status === 'error'
      },
      undefined,
      { timeout: 15000 },
    )
  } catch (error) {
    const fixtureStatus = await page
      .locator('#worker-result')
      .getAttribute('data-status')
    console.error(`Worker fixture did not complete (status: ${fixtureStatus})`)
    throw error
  }

  assert.deepEqual(pageErrors, [])
  const rawResult = await page.locator('#worker-result').innerText()
  const result = JSON.parse(rawResult)
  assert.equal(result.kind, 'primitive')
  assert.equal(result.scType, 'u32')
  assert.equal(result.value, 42)

  console.log('Browser worker regression passed: Comlink returned u32(42)')
} finally {
  try {
    await browser?.close()
  } finally {
    try {
      await server?.close()
    } finally {
      stopEsbuild()
    }
  }
}
