// @ts-check

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)

/** @typedef {'wecom' | 'dingtalk' | 'feishu'} Platform */

/**
 * @typedef {object} Adapter
 * @property {Platform} id
 * @property {string} label
 * @property {string} executable
 * @property {string} packageName
 * @property {string} packageVersion
 * @property {string} packageBin
 * @property {readonly string[]} versionArgs
 * @property {readonly (readonly string[])[]} authSteps
 * @property {string} installCommand
 * @property {string} officialInstallCommand
 * @property {string} authCommand
 */

/** @type {Readonly<Record<Platform, Adapter>>} */
export const ADAPTERS = Object.freeze({
  wecom: Object.freeze({
    id: 'wecom',
    label: '企业微信 / WeCom',
    executable: 'wecom-cli',
    packageName: '@wecom/cli',
    packageVersion: '1.1.0',
    packageBin: 'bin/wecom.js',
    versionArgs: ['--version'],
    authSteps: [['auth', 'init']],
    installCommand: 'dsh-office install wecom',
    officialInstallCommand: 'npm install -g @wecom/cli',
    authCommand: 'wecom-cli auth init',
  }),
  dingtalk: Object.freeze({
    id: 'dingtalk',
    label: '钉钉 / DingTalk',
    executable: 'dws',
    packageName: 'dingtalk-workspace-cli',
    packageVersion: '1.0.58',
    packageBin: 'bin/dws.js',
    versionArgs: ['--version'],
    authSteps: [['auth', 'login']],
    installCommand: 'dsh-office install dingtalk',
    officialInstallCommand: 'npm install -g dingtalk-workspace-cli',
    authCommand: 'dws auth login',
  }),
  feishu: Object.freeze({
    id: 'feishu',
    label: '飞书 / Lark',
    executable: 'lark-cli',
    packageName: '@larksuite/cli',
    packageVersion: '1.0.88',
    packageBin: 'scripts/run.js',
    versionArgs: ['--version'],
    authSteps: [['config', 'init'], ['auth', 'login', '--recommend']],
    installCommand: 'dsh-office install feishu',
    officialInstallCommand: 'npx @larksuite/cli@latest install',
    authCommand: 'lark-cli config init && lark-cli auth login --recommend',
  }),
})

export const PLATFORMS = /** @type {const} */ (['wecom', 'dingtalk', 'feishu'])

/**
 * @typedef {object} ResolvedCommand
 * @property {string} command
 * @property {string[]} prefixArgs
 * @property {string} displayCommand
 * @property {'configured' | 'managed' | 'package' | 'path'} source
 */

/**
 * Resolve an adapter to an executable without ever constructing a shell command.
 * A configured executable wins, followed by the explicit dsh-office install
 * root, a separately installed adjacent package, and normal PATH lookup.
 *
 * @param {Platform} platform
 * @param {string | undefined} configuredCommand
 * @returns {ResolvedCommand}
 */
export function resolveCommand(platform, configuredCommand) {
  const adapter = ADAPTERS[platform]
  if (configuredCommand !== undefined && configuredCommand.trim() !== '') {
    return {
      command: configuredCommand,
      prefixArgs: [],
      displayCommand: configuredCommand,
      source: 'configured',
    }
  }

  const managed = resolvePackageBin(adapter, officeHome())
  if (managed !== undefined) {
    return {
      command: process.execPath,
      prefixArgs: [managed],
      displayCommand: adapter.executable,
      source: 'managed',
    }
  }

  const adjacent = resolveAdjacentPackageBin(adapter)
  if (adjacent !== undefined) {
    return {
      command: process.execPath,
      prefixArgs: [adjacent],
      displayCommand: adapter.executable,
      source: 'package',
    }
  }

  return {
    command: adapter.executable,
    prefixArgs: [],
    displayCommand: adapter.executable,
    source: 'path',
  }
}

/**
 * @param {Adapter} adapter
 * @returns {string | undefined}
 */
function resolveAdjacentPackageBin(adapter) {
  try {
    const packageJson = require.resolve(`${adapter.packageName}/package.json`)
    const bin = resolve(dirname(packageJson), adapter.packageBin)
    return existsSync(bin) ? bin : undefined
  } catch {
    return undefined
  }
}

/**
 * @param {Adapter} adapter
 * @param {string} root
 * @returns {string | undefined}
 */
function resolvePackageBin(adapter, root) {
  const bin = join(root, 'node_modules', ...adapter.packageName.split('/'), adapter.packageBin)
  return existsSync(bin) ? bin : undefined
}

/**
 * Directory owned by the terminal-side installer. It is intentionally outside
 * every DSH profile so all profiles can share one pinned CLI installation.
 * @returns {string}
 */
export function officeHome() {
  if (process.env.DSH_OFFICE_HOME?.trim()) return resolve(process.env.DSH_OFFICE_HOME)
  const dshHome = process.env.DSH_HOME?.trim() ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
  return join(dshHome, 'office-cli')
}

/** @param {Platform} platform @returns {string} */
export function packageSpec(platform) {
  const adapter = ADAPTERS[platform]
  return `${adapter.packageName}@${adapter.packageVersion}`
}
