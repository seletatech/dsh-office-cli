import assert from 'node:assert/strict'
import test from 'node:test'
import { runProcess } from '../src/runner.js'

test('runs argv without a shell and captures both streams', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1]); process.stderr.write("warn")', '$(echo not-a-shell)'], {
    cwd: process.cwd(),
    timeoutMs: 5000,
    maxOutputBytes: 1024,
  })
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, '$(echo not-a-shell)')
  assert.equal(result.stderr, 'warn')
  assert.equal(result.truncated, false)
})

test('caps captured output without growing memory', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))'], {
    cwd: process.cwd(),
    timeoutMs: 5000,
    maxOutputBytes: 128,
  })
  assert.equal(Buffer.byteLength(result.stdout), 128)
  assert.equal(result.truncated, true)
})

test('terminates a timed-out process group', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: process.cwd(),
    timeoutMs: 50,
    maxOutputBytes: 128,
  })
  assert.equal(result.timedOut, true)
  assert.notEqual(result.signal, null)
})

test('escalates to SIGKILL when a process ignores SIGTERM', { skip: process.platform === 'win32' }, async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], {
    cwd: process.cwd(),
    timeoutMs: 50,
    killGraceMs: 50,
    maxOutputBytes: 128,
  })
  assert.equal(result.timedOut, true)
  assert.equal(result.signal, 'SIGKILL')
})
