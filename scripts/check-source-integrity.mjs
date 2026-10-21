import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const codePath =
  /\.(?:[cm]?[jt]s|[jt]sx|json|ya?ml|html|sh|bash|py|toml|css|md)$/i
const maxBlobBytes = 2 * 1024 * 1024

// Preserve offsets and template expressions while hiding comments and strings.
// This is a lexical heuristic, not a JavaScript parser or malware proof.
export function codeView(source) {
  const chars = source.split('')
  const literals = []
  const templates = []
  const parentheses = []
  const expressionKeywords = new Set([
    'return',
    'throw',
    'case',
    'delete',
    'void',
    'typeof',
    'new',
    'in',
    'instanceof',
    'yield',
    'await',
    'else',
    'do',
  ])
  const controlKeywords = new Set([
    'if',
    'while',
    'for',
    'with',
    'switch',
    'catch',
  ])
  let canStartRegex = true
  let previousWord = ''
  let mode = 'code'
  let start = 0
  const hide = (index) => {
    if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' '
  }
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i]
    const next = source[i + 1]
    if (mode === 'line') {
      if (c === '\n') mode = 'code'
      else hide(i)
    } else if (mode === 'block') {
      hide(i)
      if (c === '*' && next === '/') {
        hide(++i)
        mode = 'code'
      }
    } else if (mode === 'single' || mode === 'double') {
      hide(i)
      if (c === '\\') hide(++i)
      else if (c === (mode === 'single' ? "'" : '"')) {
        literals.push({ start, end: i + 1, value: source.slice(start + 1, i) })
        mode = 'code'
        canStartRegex = false
      }
    } else if (mode === 'template') {
      const template = templates[templates.length - 1]
      if (c === '$' && next === '{') {
        hide(i)
        hide(++i)
        template.interpolated = true
        template.depth = 1
        mode = 'code'
        canStartRegex = true
        previousWord = ''
      } else {
        hide(i)
        if (c === '\\') hide(++i)
        else if (c === '`') {
          if (!template.interpolated) {
            literals.push({
              start: template.start,
              end: i + 1,
              value: source.slice(template.start + 1, i),
            })
          }
          templates.pop()
          mode = 'code'
          canStartRegex = false
        }
      }
    } else if (c === '/' && next === '/' && source[i - 1] !== '\\') {
      hide(i)
      hide(++i)
      mode = 'line'
    } else if (c === '/' && next === '*' && source[i - 1] !== '\\') {
      hide(i)
      hide(++i)
      mode = 'block'
    } else if (c === '/' && canStartRegex) {
      // Consume the complete regex before interpreting comment or quote tokens.
      let end = i + 1
      let characterClass = false
      for (; end < source.length; end += 1) {
        const character = source[end]
        if (character === '\n' || character === '\r') break
        if (character === '\\') end += 1
        else if (character === '[') characterClass = true
        else if (character === ']') characterClass = false
        else if (character === '/' && !characterClass) break
      }
      if (source[end] === '/') {
        while (/[a-z]/i.test(source[end + 1] ?? '') && end + 1 < source.length)
          end += 1
        while (i < end) hide(i++)
        hide(i)
        canStartRegex = false
      } else {
        canStartRegex = true
      }
      previousWord = ''
    } else if (c === "'" || c === '"') {
      start = i
      hide(i)
      mode = c === "'" ? 'single' : 'double'
    } else if (c === '`') {
      hide(i)
      templates.push({ start: i, depth: 0, interpolated: false })
      mode = 'template'
    } else if (/\s/.test(c)) {
      continue
    } else if (/[a-z_$]/i.test(c)) {
      const wordStart = i
      while (/[\w$]/.test(source[i + 1] ?? '') && i + 1 < source.length) i += 1
      const property = previousWord === '.'
      previousWord = property ? '' : source.slice(wordStart, i + 1)
      canStartRegex = !property && expressionKeywords.has(previousWord)
    } else if (c === '(') {
      parentheses.push(controlKeywords.has(previousWord))
      canStartRegex = true
      previousWord = ''
    } else if (c === ')') {
      canStartRegex = parentheses.pop() ?? false
      previousWord = ''
    } else if (templates.length && c === '{') {
      templates[templates.length - 1].depth += 1
      canStartRegex = true
      previousWord = ''
    } else if (templates.length && c === '}') {
      const template = templates[templates.length - 1]
      template.depth -= 1
      if (template.depth === 0) {
        hide(i)
        mode = 'template'
      }
      canStartRegex = false
      previousWord = ''
    } else {
      if ((c === '+' || c === '-') && next === c) i += 1
      else canStartRegex = /[=(:,\[!&|?{;~+*%<>^\/-]/.test(c)
      previousWord = c === '.' ? '.' : ''
    }
  }
  return { code: chars.join(''), literals }
}

export function inspectSource(path, source) {
  const { code, literals } = codeView(source)
  const findings = []
  const add = (rule, offset, reason) => {
    findings.push({
      path,
      line: source.slice(0, offset).split('\n').length,
      rule,
      reason,
    })
  }
  const execution =
    /\beval\s*(?:\?\.)?\s*\(|\beval\s*\)\s*\(|\b(?:new\s+)?Function\s*\(/g
  for (const match of code.matchAll(execution)) {
    add(
      'dynamic-code-execution',
      match.index,
      'Runtime evaluation or Function construction requires maintainer review.',
    )
  }
  const disguisedNames = new Set(code.match(/\b_0x[\da-f]{3,}\b/gi) ?? [])
  if (
    disguisedNames.size >= 3 &&
    (code.match(/\b0x[\da-f]+\b/gi) ?? []).length >= 8
  ) {
    add(
      'hex-decoder-table',
      code.search(/\b_0x[\da-f]{3,}\b/i),
      'Hex-named decoder identifiers and dense hexadecimal constants resemble an obfuscator string table.',
    )
  }
  let offset = 0
  for (const line of code.split('\n')) {
    const dense = line.replace(/\s/g, '')
    if (dense.length > 1500 && (dense.match(/[;{}]/g) ?? []).length > 20) {
      add(
        'dense-executable-line',
        offset,
        'More than 1,500 non-string code characters on one line hide executable changes.',
      )
    }
    offset += line.length + 1
  }
  const controls = /[\u202a-\u202e\u2066-\u2069]/g
  for (const match of source.matchAll(controls)) {
    add(
      'bidirectional-control',
      match.index,
      'Hidden bidirectional controls can change the apparent order of reviewed source.',
    )
  }
  for (const literal of literals) {
    const prefix = code.slice(Math.max(0, literal.start - 300), literal.start)
    const suffix = code.slice(literal.end)
    if (
      literal.value === 'eval' &&
      /\[\s*$/.test(prefix) &&
      /^\s*\]\s*\(/.test(suffix)
    ) {
      add(
        'dynamic-code-execution',
        literal.start,
        'Computed eval invocation still executes source strings.',
      )
    }
    if (
      literal.value === '-e' &&
      /\b(?:spawn(?:Sync)?|execFile(?:Sync)?)\s*\([^;]*$/.test(prefix)
    ) {
      add(
        'inline-subprocess-code',
        literal.start,
        'Subprocess inline-code arguments require review for encoded or downloaded execution.',
      )
    }
    if (
      /^(?:https?:|data:)/i.test(literal.value) &&
      /\b(?:import|require)\s*\(\s*$|\bimport\s+[^;]*\bfrom\s*$|\bimport\s*$/.test(
        prefix,
      )
    ) {
      add(
        'remote-code-import',
        literal.start,
        'Remote or data-URL module imports add executable code outside the reviewed dependency graph.',
      )
    }
    if (
      (literal.value.match(/\\(?:x[\da-f]{2}|u[\da-f]{4})/gi) ?? []).length >=
      80
    ) {
      add(
        'encoded-string-payload',
        literal.start,
        'A string containing at least 80 encoded characters obscures its content from source review.',
      )
    }
  }
  return findings
}

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, {
    encoding,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_COUNT: '0' },
  })
}

export function inspectTree(ref) {
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`]).trim()
  const records = git(['ls-tree', '-r', '-z', commit])
    .split('\0')
    .filter(Boolean)
  const findings = []
  let checkedFiles = 0
  for (const record of records) {
    const separator = record.indexOf('\t')
    const [mode, type, oid] = record.slice(0, separator).split(' ')
    const path = record.slice(separator + 1)
    if (!codePath.test(path)) continue
    checkedFiles += 1
    if (mode === '120000') {
      findings.push({
        path,
        line: 1,
        rule: 'source-symlink',
        reason: 'Executable or configuration paths must be regular files.',
      })
      continue
    }
    if (type !== 'blob')
      throw new Error(`Unexpected source object at ${JSON.stringify(path)}`)
    const size = Number(git(['cat-file', '-s', oid]).trim())
    if (size > maxBlobBytes) {
      findings.push({
        path,
        line: 1,
        rule: 'oversized-source',
        reason:
          'Source exceeds the 2 MiB review limit; split or explicitly review it before merging.',
      })
      continue
    }
    const source = git(['cat-file', 'blob', oid], undefined).toString('utf8')
    if (source.includes('\0')) {
      findings.push({
        path,
        line: 1,
        rule: 'binary-source',
        reason: 'A source/configuration file contains binary NUL bytes.',
      })
      continue
    }
    findings.push(...inspectSource(path, source))
  }
  return { commit, checkedFiles, findings }
}

function main() {
  const { values } = parseArgs({
    options: { ref: { type: 'string' }, file: { type: 'string' } },
  })
  if (Boolean(values.ref) === Boolean(values.file))
    throw new Error('Pass exactly one of --ref or --file.')
  const result = values.file
    ? {
        checkedFiles: 1,
        findings: inspectSource(values.file, readFileSync(values.file, 'utf8')),
      }
    : inspectTree(values.ref)
  console.log(JSON.stringify(result, null, 2))
  if (result.findings.length) process.exitCode = 1
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main()
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Source integrity check failed.',
    )
    process.exitCode = 1
  }
}
