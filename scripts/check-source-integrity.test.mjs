import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { inspectSource, inspectTree } from './check-source-integrity.mjs'

const rules = (source) =>
  inspectSource('eslint.config.js', source).map((item) => item.rule)

test('rejects dynamic execution, including indirect eval and template expressions', () => {
  for (const source of [
    'eval(payload)',
    '(0, eval)(payload)',
    'new Function(payload)',
    'Function(payload)',
    '`hello ${eval(payload)}`',
  ]) {
    assert.ok(rules(source).includes('dynamic-code-execution'), source)
  }
})

test('ignores execution words inside comments and ordinary strings', () => {
  assert.deepEqual(
    rules(
      '// eval(payload)\n/* new Function(payload) */\nconst message = "eval(payload)";',
    ),
    [],
  )
})

test('keeps executable code visible after regex literals', () => {
  for (const source of [
    'const pattern = /a\\//; eval(payload)',
    'const pattern = /a\\/*/; new Function(payload)',
    'const pattern = /[\\/]/; eval(payload)',
    'if (ready) /a\\//.test(input); eval(payload)',
    'const pattern = `${/a\\//.source}`; eval(payload)',
    'const result = obj.return / eval(payload) / scale;',
    'const result = obj.if(ready) / eval(payload) / scale;',
    'const result = count++ / eval(payload) / scale;',
    'const result = total / divisor; eval(payload); // /a\\//',
  ]) {
    assert.ok(rules(source).includes('dynamic-code-execution'), source)
  }
  assert.deepEqual(rules('const pattern = /eval\\(payload\\)/;'), [])
  assert.deepEqual(rules('const pattern = /[/*]eval\\(payload\\)["\']/;'), [])
  assert.ok(
    rules('const result = total / eval(payload) / scale;').includes(
      'dynamic-code-execution',
    ),
  )
})

test('permits XDR/base64 data, hexadecimal limbs, and fixed module imports', () => {
  assert.deepEqual(
    rules(
      'const xdr = "AAAAAwAAACo="; const limb = 0xffff; const b = atob(xdr); import("@stellar/stellar-sdk");',
    ),
    [],
  )
})

test('rejects obfuscator-style tables without flagging one hex-named identifier', () => {
  assert.ok(
    rules(
      'const _0xabc = [0x10,0x11,0x12,0x13,0x14,0x15,0x16,0x17]; function _0xdef() { return _0xa12; }',
    ).includes('hex-decoder-table'),
  )
  assert.deepEqual(rules('const _0xabc = 0xff;'), [])
})

test('rejects dense executable lines even after whitespace padding', () => {
  assert.ok(
    rules(' '.repeat(4000) + 'const counter = 1;'.repeat(150)).includes(
      'dense-executable-line',
    ),
  )
  assert.deepEqual(rules('const data = "' + 'A'.repeat(4000) + '";'), [])
})

test('rejects hidden Unicode direction controls and encoded payload strings', () => {
  assert.ok(
    rules('// hidden ' + String.fromCharCode(0x202e)).includes(
      'bidirectional-control',
    ),
  )
  assert.ok(
    rules('const text = "' + '\\x61'.repeat(80) + '";').includes(
      'encoded-string-payload',
    ),
  )
})

test('rejects remote imports but allows ordinary URLs and data fixtures', () => {
  assert.ok(
    rules('import("https://example.invalid/payload.mjs")').includes(
      'remote-code-import',
    ),
  )
  assert.ok(
    rules('import value from "data:text/javascript,export default 1"').includes(
      'remote-code-import',
    ),
  )
  assert.deepEqual(
    rules(
      'const url = "https://rpc.example.invalid"; const input = \'import("https://example.invalid")\';',
    ),
    [],
  )
})

test('inspects static template literals like quoted literals', () => {
  for (const source of [
    'import(`https://example.invalid/payload.mjs`)',
    'import(`data:text/javascript,export default 1`)',
    'require(`https://example.invalid/payload.mjs`)',
    'const outer = `${import(`data:text/javascript,export default 1`)}`',
  ]) {
    assert.ok(rules(source).includes('remote-code-import'), source)
  }
  assert.ok(
    rules('globalThis[`eval`](payload)').includes('dynamic-code-execution'),
  )
  assert.deepEqual(
    rules(
      'const url = `https://rpc.example.invalid`; import(`@stellar/stellar-sdk`);',
    ),
    [],
  )
})

test('rejects computed eval and inline subprocess code', () => {
  assert.ok(
    rules('globalThis["eval"](payload)').includes('dynamic-code-execution'),
  )
  assert.ok(
    rules('spawn("node", ["-e", payload], { detached: true })').includes(
      'inline-subprocess-code',
    ),
  )
  assert.deepEqual(rules('execFileSync("gh", ["issue", "list"])'), [])
})

test('reads Git objects as text without importing the inspected code', () => {
  const directory = mkdtempSync(join(tmpdir(), 'source-integrity-test-'))
  const previousDirectory = process.cwd()
  try {
    execFileSync('git', ['init', '-q', directory])
    execFileSync('git', [
      '-C',
      directory,
      'config',
      'user.name',
      'Test Fixture',
    ])
    execFileSync('git', [
      '-C',
      directory,
      'config',
      'user.email',
      'fixture@example.invalid',
    ])
    writeFileSync(
      join(directory, 'eslint.config.js'),
      'eval("throw new Error(\\"should never execute\\")")',
    )
    execFileSync('git', ['-C', directory, 'add', 'eslint.config.js'])
    execFileSync('git', ['-C', directory, 'commit', '-qm', 'fixture'])
    process.chdir(directory)
    const result = inspectTree('HEAD')
    assert.equal(result.checkedFiles, 1)
    assert.equal(result.findings[0].rule, 'dynamic-code-execution')
    assert.throws(() => inspectTree('missing-ref'))
  } finally {
    process.chdir(previousDirectory)
    rmSync(directory, { recursive: true, force: true })
  }
})
