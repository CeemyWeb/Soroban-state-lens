import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { stop as stopEsbuild } from 'esbuild'
import { chromium } from 'playwright'
import { build, preview } from 'vite'

let server
let browser

try {
  await build({
    configFile: false,
    root: resolve('.'),
    build: {
      rollupOptions: {
        input: resolve('src/test/workers/decoder-worker-regression.html'),
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

  await page.goto(
    `http://127.0.0.1:${address.port}/src/test/workers/decoder-worker-regression.html`,
  )
  try {
    await page.waitForFunction(
      () => {
        const status = document
          .querySelector('#result')
          ?.getAttribute('data-status')
        return status === 'passed' || status === 'failed'
      },
      undefined,
      { timeout: 15000 },
    )
  } catch (error) {
    const fixtureStatus = await page
      .locator('#result')
      .getAttribute('data-status')
    console.error(
      `Worker regression did not complete (status: ${fixtureStatus})`,
    )
    throw error
  }

  assert.deepEqual(pageErrors, [])
  const rawResult = await page.locator('#result').innerText()
  const result = JSON.parse(rawResult)
  assert.equal(result.status, 'passed', result.error ?? rawResult)
  assert.equal(result.createdWorkers, 2)
  assert.equal(result.terminatedWorkers, 2)
  assert.equal(
    result.addresses,
    'account and contract StrKeys retained across Comlink',
  )
  assert.equal(
    result.truncation,
    'nested map/vector depth and path retained across Comlink',
  )

  console.log(
    'Browser worker regressions passed: recovery, nested values, addresses, truncation, and snapshot reload',
  )
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
