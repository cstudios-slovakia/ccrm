// File-size ratchet: big files may not keep growing. See .agents/rules/large-files.md
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const baseline = JSON.parse(readFileSync(join(root, 'scripts/agent/file-size-baseline.json'), 'utf8')) as {
  threshold: number
  slack: number
  files: Record<string, number>
}

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

// Same count as `wc -l`: number of newline characters.
const lines = (p: string) => (readFileSync(p, 'utf8').match(/\n/g) ?? []).length

test('no source file outgrows the file-size baseline', () => {
  const files = [
    ...walk(join(root, 'src'), ['.ts', '.tsx']),
    ...walk(join(root, 'public'), ['.php']),
  ].map((p) => relative(root, p).split(sep).join('/'))

  const problems: string[] = []
  for (const f of files) {
    const n = lines(join(root, f))
    const base = baseline.files[f]
    if (base === undefined) {
      if (n > baseline.threshold) {
        problems.push(`${f}: ${n} lines, over the ${baseline.threshold} limit for new files. Extract a module instead of growing it.`)
      }
    } else if (n > base + baseline.slack) {
      problems.push(`${f}: ${n} lines, baseline ${base} + ${baseline.slack}. Extract a module next to it (see .agents/rules/large-files.md).`)
    } else if (n < base) {
      console.log(`note: ${f} shrank to ${n} (baseline ${base}); lower it in scripts/agent/file-size-baseline.json`)
    }
  }
  for (const f of Object.keys(baseline.files)) {
    if (!files.includes(f)) console.log(`note: ${f} no longer exists; remove it from the baseline`)
  }
  assert.deepEqual(problems, [], '\n' + problems.join('\n'))
})
