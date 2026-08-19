// @ts-check

import { spawn } from 'node:child_process'

/**
 * @typedef {object} RunOptions
 * @property {string} cwd
 * @property {number} timeoutMs
 * @property {number | undefined} [killGraceMs]
 * @property {number} maxOutputBytes
 * @property {AbortSignal | undefined} [signal]
 * @property {NodeJS.ProcessEnv | undefined} [env]
 */

/**
 * @typedef {object} RunResult
 * @property {number | null} exitCode
 * @property {NodeJS.Signals | null} signal
 * @property {string} stdout
 * @property {string} stderr
 * @property {boolean} truncated
 * @property {boolean} timedOut
 * @property {boolean} aborted
 * @property {number} durationMs
 * @property {string | undefined} spawnError
 */

/**
 * Run one executable with argv, no shell, bounded output, cancellation, and a
 * process-group kill on Unix so downloaded Node wrappers do not leave their
 * native child alive after a timeout.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @param {RunOptions} options
 * @returns {Promise<RunResult>}
 */
export function runProcess(command, args, options) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now()
    /** @type {Buffer[]} */
    const stdout = []
    /** @type {Buffer[]} */
    const stderr = []
    let capturedBytes = 0
    let truncated = false
    let timedOut = false
    let aborted = false
    /** @type {string | undefined} */
    let spawnError
    let settled = false
    /** @type {NodeJS.Timeout | undefined} */
    let forceKillTimer

    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: {
        ...process.env,
        NO_COLOR: '1',
        ...options.env,
      },
      detached: process.platform !== 'win32',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    /** @param {Buffer} chunk @param {Buffer[]} destination */
    const capture = (chunk, destination) => {
      const remaining = options.maxOutputBytes - capturedBytes
      if (remaining <= 0) {
        truncated = true
        return
      }
      if (chunk.length <= remaining) {
        destination.push(chunk)
        capturedBytes += chunk.length
        return
      }
      destination.push(chunk.subarray(0, remaining))
      capturedBytes += remaining
      truncated = true
    }

    child.stdout?.on('data', chunk => capture(Buffer.from(chunk), stdout))
    child.stderr?.on('data', chunk => capture(Buffer.from(chunk), stderr))

    /** @param {NodeJS.Signals} signal */
    const signalProcess = (signal) => {
      if (child.pid === undefined) return
      try {
        if (process.platform === 'win32') child.kill(signal)
        else process.kill(-child.pid, signal)
      } catch {
        // The process may have exited between the timeout and this signal.
      }
    }

    const kill = () => {
      signalProcess('SIGTERM')
      forceKillTimer ??= setTimeout(() => signalProcess('SIGKILL'), options.killGraceMs ?? 2000)
      forceKillTimer.unref()
    }

    const timeout = setTimeout(() => {
      timedOut = true
      kill()
    }, options.timeoutMs)
    timeout.unref()

    const abort = () => {
      aborted = true
      kill()
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted === true) abort()

    /** @param {number | null} exitCode @param {NodeJS.Signals | null} exitSignal */
    const finish = (exitCode, exitSignal) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer)
      options.signal?.removeEventListener('abort', abort)
      resolvePromise({
        exitCode,
        signal: exitSignal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        truncated,
        timedOut,
        aborted,
        durationMs: Date.now() - startedAt,
        spawnError,
      })
    }

    child.once('error', (error) => {
      spawnError = error.message
    })
    child.once('close', finish)
  })
}
