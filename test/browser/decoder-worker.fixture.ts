import { createDecoderWorker } from '../../src/workers/createDecoderWorker'

const output = document.querySelector<HTMLPreElement>('#worker-result')
if (!output) {
  throw new Error('Decoder worker result element is missing')
}

const worker = createDecoderWorker()
const scalarXdr = new URLSearchParams(window.location.search).get('xdr')

if (scalarXdr === null) {
  output.dataset.status = 'error'
  output.textContent = JSON.stringify({ error: 'Missing scalar XDR fixture' })
} else {
  output.dataset.status = 'running'
  try {
    const result = await worker.decodeScVal({
      xdr: scalarXdr,
    })
    output.dataset.status = 'complete'
    output.textContent = JSON.stringify(result)
  } catch (error) {
    output.dataset.status = 'error'
    output.textContent = JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
