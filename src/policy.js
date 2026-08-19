// @ts-check

import { isAbsolute, relative, resolve, sep } from 'node:path'

/** @typedef {'wecom' | 'dingtalk' | 'feishu'} Platform */
/** @typedef {'read' | 'write' | 'destructive'} Risk */

const BLOCKED_TOP_LEVEL = new Set([
  'auth',
  'completion',
  'config',
  'event',
  'install',
  'mcp',
  'server',
  'skill',
  'upgrade',
])

const BLOCKED_LONG_RUNNING = new Set(['consume', 'listen', 'serve', 'stream', 'watch'])

const SECRET_FLAGS = /^(?:--)?(?:access[-_]?token|app[-_]?secret|client[-_]?secret|password|refresh[-_]?token|robot[-_]?access[-_]?token|secret|token)$/i
const SECRET_ASSIGNMENT = /(?:^|_)(?:ACCESS_TOKEN|APP_SECRET|CLIENT_SECRET|PASSWORD|REFRESH_TOKEN|ROBOT_ACCESS_TOKEN|SECRET|TOKEN)=/i

const DESTRUCTIVE_VERBS = new Set([
  'cancel',
  'clear',
  'delete',
  'disable',
  'dismiss',
  'drop',
  'expel',
  'purge',
  'recall',
  'reject',
  'remove',
  'reset',
  'revoke',
  'terminate',
])

const WRITE_VERBS = new Set([
  'add',
  'append',
  'approve',
  'archive',
  'complete',
  'copy',
  'create',
  'done',
  'edit',
  'forward',
  'import',
  'invite',
  'move',
  'patch',
  'publish',
  'reply',
  'restore',
  'send',
  'set',
  'share',
  'submit',
  'transfer',
  'unarchive',
  'update',
  'upload',
  'write',
])

const READ_VERBS = new Set([
  'agenda',
  'check',
  'describe',
  'download',
  'export',
  'find',
  'get',
  'info',
  'list',
  'metadata',
  'query',
  'read',
  'resolve',
  'schema',
  'search',
  'show',
  'status',
  'view',
])

/**
 * @typedef {object} PolicyConfig
 * @property {number} maxArgs
 * @property {number} maxArgLength
 * @property {boolean} allowRawApi
 * @property {boolean} workspaceFilesOnly
 */

/**
 * @typedef {object} PolicyDecision
 * @property {boolean} allowed
 * @property {Risk} risk
 * @property {string} reason
 */

/**
 * Validate model-provided argv and classify the operation. Unknown operations
 * are treated as writes, so the default DSH policy asks the user once.
 *
 * @param {Platform} platform
 * @param {readonly string[]} args
 * @param {boolean} dryRun
 * @param {string} cwd
 * @param {PolicyConfig} config
 * @returns {PolicyDecision}
 */
export function evaluateRequest(platform, args, dryRun, cwd, config) {
  if (args.length === 0) {
    return deny('write', 'at least one CLI argument is required')
  }
  if (args.length > config.maxArgs) {
    return deny('write', `argument count exceeds the configured limit (${config.maxArgs})`)
  }

  for (const arg of args) {
    if (typeof arg !== 'string') return deny('write', 'every CLI argument must be a string')
    if (arg.length > config.maxArgLength) {
      return deny('write', `one argument exceeds the configured length limit (${config.maxArgLength})`)
    }
    if (arg.includes('\0')) return deny('write', 'NUL bytes are not valid CLI arguments')
  }

  const first = args[0]
  if (first.startsWith('-') && first !== '--help' && first !== '-h' && first !== '--version' && first !== '-V') {
    return deny('write', 'put the service or command before global flags so the safety policy can identify it')
  }

  const topLevel = normalizeToken(first)
  if (BLOCKED_TOP_LEVEL.has(topLevel)) {
    return deny('write', `interactive or host-management command "${first}" is blocked; run it yourself with dsh-office auth or the vendor CLI`)
  }
  if (topLevel === 'api' && !config.allowRawApi) {
    return deny('write', 'raw API mode is disabled; enable allowRawApi only after reviewing the vendor endpoint surface')
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const [flag, inlineValue] = splitFlag(arg)
    if (SECRET_FLAGS.test(flag) || SECRET_ASSIGNMENT.test(arg)) {
      return deny('write', 'credential values are blocked because tool arguments are persisted in the DSH session log')
    }
    if (SECRET_FLAGS.test(flag) && inlineValue === undefined && index + 1 < args.length) {
      return deny('write', 'credential values are blocked because tool arguments are persisted in the DSH session log')
    }
    const normalized = normalizeToken(arg)
    if (BLOCKED_LONG_RUNNING.has(normalized)) {
      return deny('write', `long-running command "${arg}" is not supported by the foreground office_cli tool`)
    }
    const rawApiEndpoint = topLevel === 'api' && /^\/(?:open-apis|oapi|v1\.0)\//u.test(arg)
    if (config.workspaceFilesOnly && !rawApiEndpoint && isEscapingPathArgument(arg, cwd)) {
      return deny('write', `path argument escapes the session workspace: ${arg}`)
    }
  }

  const effectiveDryRun = dryRun || args.includes('--dry-run')
  if (effectiveDryRun) return allow('read', 'dry-run does not send the mutation')

  const risk = classifyRisk(args)
  return allow(risk, risk === 'read' ? 'recognized read-only command' : `recognized ${risk} operation`)
}

/**
 * @param {readonly string[]} args
 * @returns {Risk}
 */
export function classifyRisk(args) {
  if (args.some(arg => arg === '--help' || arg === '-h' || arg === '--version' || arg === '-V')) return 'read'
  const tokens = args
    .filter(arg => !arg.startsWith('-'))
    .flatMap(arg => arg.split(/[\s:_./-]+/u))
    .map(normalizeToken)
    .filter(Boolean)

  if (tokens.some(token => DESTRUCTIVE_VERBS.has(token))) return 'destructive'
  if (tokens.some(token => WRITE_VERBS.has(token))) return 'write'
  if (tokens.some(token => READ_VERBS.has(token))) return 'read'
  if (tokens.includes('get')) return 'read'
  return 'write'
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeToken(value) {
  return value.replace(/^\++/u, '').replace(/^--?/u, '').toLowerCase()
}

/**
 * @param {string} arg
 * @returns {[string, string | undefined]}
 */
function splitFlag(arg) {
  const equals = arg.indexOf('=')
  return equals === -1 ? [arg, undefined] : [arg.slice(0, equals), arg.slice(equals + 1)]
}

/**
 * Reject only path forms that can escape cwd. Relative paths inside cwd remain
 * available, and URLs are not mistaken for filesystem paths.
 *
 * @param {string} arg
 * @param {string} cwd
 * @returns {boolean}
 */
function isEscapingPathArgument(arg, cwd) {
  const [, inlineValue] = splitFlag(arg)
  const candidate = inlineValue ?? (arg.startsWith('@') ? arg.slice(1) : arg)
  if (candidate === '' || candidate === '-' || candidate === '@-') return false
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(candidate)) return false
  if (!isAbsolute(candidate) && !candidate.split(/[\\/]+/u).includes('..')) return false
  const absolute = resolve(cwd, candidate)
  const rel = relative(resolve(cwd), absolute)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

/** @param {Risk} risk @param {string} reason @returns {PolicyDecision} */
function allow(risk, reason) {
  return { allowed: true, risk, reason }
}

/** @param {Risk} risk @param {string} reason @returns {PolicyDecision} */
function deny(risk, reason) {
  return { allowed: false, risk, reason }
}
