// @ts-check

import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'
import { ADAPTERS, PLATFORMS, resolveCommand } from './adapters.js'
import { evaluateRequest, executionArgs } from './policy.js'
import { runProcess } from './runner.js'
import { registerOfficeSkill } from './skill.js'

export const name = 'dsh-office-cli'
export const inject = ['tools', 'skills']

/** @typedef {'wecom' | 'dingtalk' | 'feishu'} Platform */
/** @typedef {'writes' | 'all' | 'off'} ApprovalMode */

/**
 * @typedef {object} ConfigShape
 * @property {ApprovalMode | undefined} [approval]
 * @property {number | undefined} [timeoutMs]
 * @property {number | undefined} [killGraceMs]
 * @property {number | undefined} [maxOutputBytes]
 * @property {number | undefined} [maxArgs]
 * @property {number | undefined} [maxArgLength]
 * @property {boolean | undefined} [allowRawApi]
 * @property {boolean | undefined} [workspaceFilesOnly]
 * @property {string | undefined} [wecomCommand]
 * @property {string | undefined} [dingtalkCommand]
 * @property {string | undefined} [feishuCommand]
 */

export const Config = Schema.object({
  approval: Schema.union(['writes', 'all', 'off']).default('writes'),
  timeoutMs: Schema.number().default(120000),
  killGraceMs: Schema.number().default(2000),
  maxOutputBytes: Schema.number().default(262144),
  maxArgs: Schema.number().default(128),
  maxArgLength: Schema.number().default(65536),
  allowRawApi: Schema.boolean().default(false),
  workspaceFilesOnly: Schema.boolean().default(true),
  wecomCommand: Schema.string(),
  dingtalkCommand: Schema.string(),
  feishuCommand: Schema.string(),
})

/** @type {Required<Omit<ConfigShape, 'wecomCommand' | 'dingtalkCommand' | 'feishuCommand'>>} */
const DEFAULTS = Object.freeze({
  approval: 'writes',
  timeoutMs: 120000,
  killGraceMs: 2000,
  maxOutputBytes: 262144,
  maxArgs: 128,
  maxArgLength: 65536,
  allowRawApi: false,
  workspaceFilesOnly: true,
})

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {ConfigShape} [config]
 */
export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config)
  const skills = /** @type {{ registerProvider(create: () => unknown): unknown }} */ (ctx.get('skills'))
  if (skills === undefined) throw new Error('dsh-office-cli: ctx.skills is required')
  registerOfficeSkill(skills)

  const officeTool = defineTool({
    name: 'office_cli',
    description: 'Run one official WeCom, DingTalk, or Feishu/Lark CLI command using an argv array. Auth, upgrades, long-running listeners, secrets in arguments, and workspace-escaping paths are blocked. Use dry_run before mutations; non-dry-run writes require approval by default.',
    parameters: {
      platform: {
        type: 'string',
        required: true,
        enum: [...PLATFORMS],
        description: 'Office platform: wecom, dingtalk, or feishu.',
      },
      args: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'Exact vendor CLI argv, one array element per argument. Do not include the executable name or shell quoting.',
      },
      purpose: {
        type: 'string',
        required: true,
        description: 'A short human-readable explanation of the operation and intended effect.',
      },
      dry_run: {
        type: 'boolean',
        description: 'Append --dry-run. Use before any create, update, send, approve, delete, or other mutation.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          platform: { type: 'string', required: true },
          command: { type: 'string', required: true },
          args: { type: 'array', required: true, items: { type: 'string' } },
          risk: { type: 'string', required: true, enum: ['read', 'write', 'destructive'] },
          exitCode: { required: true, oneOf: [{ type: 'integer' }, { type: 'null' }] },
          signal: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
          stdout: { type: 'string', required: true },
          stderr: { type: 'string', required: true },
          truncated: { type: 'boolean', required: true },
          timedOut: { type: 'boolean', required: true },
          aborted: { type: 'boolean', required: true },
          durationMs: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderRunResult(value),
      }],
    },
    timeoutMs: resolved.timeoutMs + 5000,
    isConcurrencySafe: args => evaluate(args, process.cwd(), resolved).risk === 'read',
    async execute(args, exec) {
      const platform = /** @type {Platform} */ (args.platform)
      const cwd = exec.agent?.session.header.cwd ?? process.cwd()
      const decision = evaluate(args, cwd, resolved)
      if (!decision.allowed) throw new Error(decision.reason)

      const command = resolveCommand(platform, commandOverride(platform, resolved))
      const vendorArgs = executionArgs(args.args, args.dry_run === true)
      const result = await runProcess(command.command, [...command.prefixArgs, ...vendorArgs], {
        cwd,
        timeoutMs: resolved.timeoutMs,
        killGraceMs: resolved.killGraceMs,
        maxOutputBytes: resolved.maxOutputBytes,
        signal: exec.signal,
      })
      if (result.spawnError !== undefined) {
        const adapter = ADAPTERS[platform]
        throw new Error(`${adapter.executable} could not start: ${result.spawnError}. Install with: ${adapter.installCommand}`)
      }
      return {
        platform,
        command: command.displayCommand,
        args: vendorArgs,
        risk: decision.risk,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
        timedOut: result.timedOut,
        aborted: result.aborted,
        durationMs: result.durationMs,
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: `${args.platform}: ${args.purpose}`,
      kind: args.dry_run === true ? 'read' : 'execute',
      rawInput: args.args.join(' '),
    }),
  })

  const doctorTool = defineTool({
    name: 'office_cli_doctor',
    description: 'Check whether the official WeCom, DingTalk, and Feishu/Lark CLIs are executable. This checks versions only and never reads credentials or account identity.',
    parameters: {
      platform: {
        type: 'string',
        enum: [...PLATFORMS],
        description: 'Optional single platform. Omit to check all three.',
      },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            platform: { type: 'string', required: true },
            available: { type: 'boolean', required: true },
            source: { type: 'string', required: true },
            version: { type: 'string', required: true },
            error: { type: 'string', required: true },
            install: { type: 'string', required: true },
            auth: { type: 'string', required: true },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderDoctor(value) }],
    },
    timeoutMs: Math.min(resolved.timeoutMs, 30000),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const platforms = args.platform === undefined ? PLATFORMS : [/** @type {Platform} */ (args.platform)]
      const cwd = exec.agent?.session.header.cwd ?? process.cwd()
      return Promise.all(platforms.map(platform => inspectPlatform(platform, cwd, resolved, exec.signal)))
    },
    presentCall: args => ({
      card: 'generic',
      title: `Check office CLI${args.platform === undefined ? 's' : `: ${args.platform}`}`,
      kind: 'read',
      rawInput: args.platform ?? 'all',
    }),
  })

  ctx.tools.register(officeTool)
  ctx.tools.register(doctorTool)

  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name !== 'office_cli') return next()
    const args = /** @type {{ platform?: unknown, args?: unknown, purpose?: unknown, dry_run?: unknown }} */ (exec.arguments)
    if (!PLATFORMS.includes(/** @type {Platform} */ (args.platform)) || !Array.isArray(args.args)) return next()
    const decision = evaluate(/** @type {any} */ (args), exec.agent?.session.header.cwd ?? process.cwd(), resolved)
    if (!decision.allowed) return { kind: 'deny', reason: decision.reason }
    if (resolved.approval === 'off') return next()
    if (resolved.approval === 'all' || decision.risk !== 'read') {
      const purpose = typeof args.purpose === 'string' ? args.purpose : 'Run office CLI command'
      return {
        kind: 'ask',
        reason: `${purpose} (${String(args.platform)}, ${decision.risk}): ${args.args.join(' ')}`,
      }
    }
    return next()
  })
}

/**
 * @param {ConfigShape} config
 */
function resolveConfig(config) {
  const resolved = { ...DEFAULTS, ...config }
  for (const [name, value] of Object.entries({
    timeoutMs: resolved.timeoutMs,
    killGraceMs: resolved.killGraceMs,
    maxOutputBytes: resolved.maxOutputBytes,
    maxArgs: resolved.maxArgs,
    maxArgLength: resolved.maxArgLength,
  })) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`dsh-office-cli: ${name} must be a positive integer`)
  }
  return resolved
}

/**
 * @param {Platform} platform
 * @param {ReturnType<typeof resolveConfig>} config
 */
function commandOverride(platform, config) {
  if (platform === 'wecom') return config.wecomCommand
  if (platform === 'dingtalk') return config.dingtalkCommand
  return config.feishuCommand
}

/**
 * @param {{ platform: string, args: readonly string[], dry_run?: boolean }} args
 * @param {string} cwd
 * @param {ReturnType<typeof resolveConfig>} config
 */
function evaluate(args, cwd, config) {
  return evaluateRequest(
    /** @type {Platform} */ (args.platform),
    args.args,
    args.dry_run === true,
    cwd,
    config,
  )
}

/**
 * @param {Platform} platform
 * @param {string} cwd
 * @param {ReturnType<typeof resolveConfig>} config
 * @param {AbortSignal} signal
 */
async function inspectPlatform(platform, cwd, config, signal) {
  const adapter = ADAPTERS[platform]
  const command = resolveCommand(platform, commandOverride(platform, config))
  const result = await runProcess(command.command, [...command.prefixArgs, ...adapter.versionArgs], {
    cwd,
    timeoutMs: Math.min(config.timeoutMs, 20000),
    killGraceMs: config.killGraceMs,
    maxOutputBytes: Math.min(config.maxOutputBytes, 32768),
    signal,
  })
  const version = `${result.stdout}\n${result.stderr}`.trim()
  const available = result.spawnError === undefined && result.exitCode === 0
  return {
    platform,
    available,
    source: command.source,
    version: available ? version : '',
    error: available ? '' : result.spawnError ?? (version || `exit ${String(result.exitCode)}`),
    install: adapter.installCommand,
    auth: adapter.authCommand,
  }
}

/** @param {any} value */
function renderRunResult(value) {
  const status = value.exitCode === 0 ? 'completed' : `failed (exit ${String(value.exitCode)})`
  const flags = [value.truncated ? 'output truncated' : '', value.timedOut ? 'timed out' : '', value.aborted ? 'aborted' : ''].filter(Boolean)
  return [
    `${value.platform} ${status}; risk=${value.risk}; duration=${value.durationMs}ms${flags.length > 0 ? `; ${flags.join(', ')}` : ''}`,
    value.stdout === '' ? '' : `stdout:\n${value.stdout}`,
    value.stderr === '' ? '' : `stderr:\n${value.stderr}`,
  ].filter(Boolean).join('\n\n')
}

/** @param {any[]} rows */
function renderDoctor(rows) {
  return rows.map(row => row.available
    ? `✓ ${row.platform}: ${row.version || 'available'} (${row.source})`
    : `✗ ${row.platform}: ${row.error}\n  install: ${row.install}\n  auth: ${row.auth}`,
  ).join('\n')
}
