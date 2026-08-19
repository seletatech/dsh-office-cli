#!/usr/bin/env node
// @ts-check

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ADAPTERS, PLATFORMS, officeHome, packageSpec, resolveCommand } from '../src/adapters.js'
import { runProcess } from '../src/runner.js'

/** @typedef {'wecom' | 'dingtalk' | 'feishu'} Platform */

const argv = process.argv.slice(2)
const command = argv[0] ?? 'help'

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp()
  process.exitCode = 0
} else if (command === 'doctor') {
  const asJson = argv.includes('--json')
  const requested = argv.find(arg => PLATFORMS.includes(/** @type {any} */ (arg)))
  const platforms = requested === undefined ? PLATFORMS : [/** @type {Platform} */ (requested)]
  const rows = await Promise.all(platforms.map(inspect))
  if (asJson) console.log(JSON.stringify(rows, null, 2))
  else printDoctor(rows)
  process.exitCode = rows.every(row => row.available) ? 0 : 1
} else if (command === 'auth') {
  const platform = argv[1]
  if (!PLATFORMS.includes(/** @type {any} */ (platform))) {
    console.error('Usage: dsh-office auth <wecom|dingtalk|feishu>')
    process.exitCode = 2
  } else {
    process.exitCode = await authenticate(/** @type {any} */ (platform))
  }
} else if (command === 'install') {
  const requested = argv[1] ?? 'all'
  if (requested !== 'all' && !PLATFORMS.includes(/** @type {any} */ (requested))) {
    console.error('Usage: dsh-office install [all|wecom|dingtalk|feishu]')
    process.exitCode = 2
  } else {
    const platforms = requested === 'all' ? PLATFORMS : [/** @type {Platform} */ (requested)]
    process.exitCode = await installPlatforms(platforms)
  }
} else {
  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exitCode = 2
}

function printHelp() {
  console.log(`dsh-office — setup helper for dsh-office-cli

Usage:
  dsh-office install [all|wecom|dingtalk|feishu]
  dsh-office doctor [wecom|dingtalk|feishu] [--json]
  dsh-office auth <wecom|dingtalk|feishu>

When installed in a DSH profile:
  dsh plugin --profile web exec dsh-office install
  dsh plugin --profile web exec dsh-office doctor
  dsh plugin --profile web exec dsh-office auth feishu

The DSH model-facing tool never accepts authentication commands or secrets.
Run authentication here, in your own terminal.`)
}

/** @param {readonly Platform[]} platforms */
async function installPlatforms(platforms) {
  const target = officeHome()
  mkdirSync(target, { recursive: true })
  const manifest = join(target, 'package.json')
  if (!existsSync(manifest)) writeFileSync(manifest, `${JSON.stringify({ private: true }, null, 2)}\n`, { flag: 'wx' })
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  console.log(`Installing official CLIs into ${target}`)
  return spawnInteractive(npm, [
    'install',
    '--prefix', target,
    '--save-exact',
    '--no-audit',
    '--no-fund',
    ...platforms.map(packageSpec),
  ])
}

/** @param {Platform} platform */
async function inspect(platform) {
  const adapter = ADAPTERS[platform]
  const resolved = resolveCommand(platform, process.env[`DSH_OFFICE_${platform.toUpperCase()}_COMMAND`])
  const result = await runProcess(resolved.command, [...resolved.prefixArgs, ...adapter.versionArgs], {
    cwd: process.cwd(),
    timeoutMs: 20000,
    maxOutputBytes: 32768,
  })
  const detail = `${result.stdout}\n${result.stderr}`.trim()
  const available = result.spawnError === undefined && result.exitCode === 0
  return {
    platform,
    label: adapter.label,
    available,
    source: resolved.source,
    version: available ? detail : '',
    error: available ? '' : result.spawnError ?? (detail || `exit ${String(result.exitCode)}`),
    install: adapter.installCommand,
    auth: adapter.authCommand,
  }
}

/** @param {Awaited<ReturnType<typeof inspect>>[]} rows */
function printDoctor(rows) {
  for (const row of rows) {
    if (row.available) console.log(`✓ ${row.label}: ${row.version || 'available'} (${row.source})`)
    else {
      console.log(`✗ ${row.label}: ${row.error}`)
      console.log(`  install: ${row.install}`)
      console.log(`  auth: ${row.auth}`)
    }
  }
}

/** @param {Platform} platform */
async function authenticate(platform) {
  const adapter = ADAPTERS[platform]
  const resolved = resolveCommand(platform, process.env[`DSH_OFFICE_${platform.toUpperCase()}_COMMAND`])
  for (const step of adapter.authSteps) {
    const exitCode = await spawnInteractive(resolved.command, [...resolved.prefixArgs, ...step])
    if (exitCode !== 0) return exitCode
  }
  return 0
}

/** @param {string} executable @param {readonly string[]} args */
function spawnInteractive(executable, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [...args], {
      cwd: process.cwd(),
      env: process.env,
      shell: process.platform === 'win32',
      stdio: 'inherit',
      windowsHide: false,
    })
    child.once('error', reject)
    child.once('close', code => resolvePromise(code ?? 1))
  })
}
