import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as OfficePlugin from '../src/index.js'
import { mkdtemp, writeFile, readFile, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function runtime() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
  if (typeof /** @type {any} */ (ctx.tools).setExecutor === 'function') {
    await ctx.plugin(await import('@deepseek-ai/dsh-tool-executor-native'))
  }
  return ctx
}

/** @param {Context} ctx @param {Record<string, unknown>} args @param {object} [agent] */
async function execute(ctx, args, agent) {
  const tools = /** @type {any} */ (ctx.tools)
  const call = { callId: 'office-test-call', name: 'office_cli', arguments: args,
    signal: new AbortController().signal, ...(agent ? { agent } : {}) }
  if (typeof tools.setExecutor !== 'function') return tools.execute(call)
  const batch = await tools.execute({
    calls: [{ type: 'tool-call', id: call.callId, name: call.name, arguments: JSON.stringify(args) }],
    signal: call.signal, ...(agent ? { agent } : {}),
  })
  assert.equal(batch.results.length, 1)
  return batch.results[0].result
}

test('loads into real Cordis registries and disposes cleanly', async () => {
  const ctx = await runtime()
  const fiber = await ctx.plugin(OfficePlugin, {
    wecomCommand: process.execPath,
    timeoutMs: 5000,
  })

  assert.deepEqual(
    ctx.tools.schemas().map(tool => tool.name),
    ['office_cli', 'office_cli_doctor'],
  )
  const skills = await ctx.skills.list()
  assert.equal(skills.length, 1)
  assert.equal(skills[0]?.name, 'dsh-office-cli')
  assert.match((await ctx.skills.get('dsh-office-cli'))?.content ?? '', /Required workflow/)

  const result = await execute(ctx, {
    platform: 'wecom',
    args: ['--version'],
    purpose: 'Verify the shell-free plugin execution path',
  })
  assert.equal(result.isError, false)
  assert.match(result.content[0]?.type === 'text' ? result.content[0].text : '', /wecom completed/)

  await fiber.dispose()
  assert.deepEqual(ctx.tools.schemas(), [])
  assert.deepEqual(await ctx.skills.list(), [])
  const unloaded = await execute(ctx, { platform: 'wecom', args: ['--version'], purpose: 'Check unloaded tool' })
  assert.equal(unloaded.isError, true)
})

test('current native executor waits for approval, fails closed, and grants exactly one write', async t => {
  const ctx = await runtime()
  if (typeof /** @type {any} */ (ctx.tools).setExecutor !== 'function') {
    t.skip('The batch executor approval seam is specific to DSH 0.2')
    return
  }
  const root = await mkdtemp(join(tmpdir(), 'dsh-office-approval-'))
  const command = join(root, 'fixture-cli.js'), marker = join(root, 'sent.txt')
  await writeFile(command, `#!${process.execPath}\nimport fs from 'node:fs';let dry=false;for(let i=2;i<process.argv.length;i++){if(process.argv[i]==='--text'){i++;continue;}if(process.argv[i]==='--dry-run')dry=true;}if(!dry)fs.appendFileSync(${JSON.stringify(marker)},'sent\\n');process.stdout.write(JSON.stringify({ok:true}));\n`)
  await chmod(command, 0o700)
  const fiber = await ctx.plugin(OfficePlugin, { wecomCommand: command, timeoutMs: 5000 })
  const args = { platform: 'wecom', args: ['message', 'aibot', 'send', '--text', 'Synthetic approval fixture'], purpose: 'Send one synthetic reply' }
  const agent = { session: { header: { cwd: root } } }
  try {
    const missing = await execute(ctx, args, agent)
    assert.equal(missing.isError, true)
    await assert.rejects(readFile(marker), { code: 'ENOENT' })
    let requests = 0
    /** @type {(value: string) => void} */ let resolveApproval = () => {}
    /** @type {() => void} */ let approvalRequested = () => {}
    const requested = new Promise(resolve => { approvalRequested = () => resolve(undefined) })
    let decision = new Promise(resolve => { resolveApproval = resolve })
    ctx.provide('approval', /** @type {any} */ ({ request: async () => { requests++; approvalRequested(); return decision } }))
    const pending = execute(ctx, args, agent)
    await requested
    await assert.rejects(readFile(marker), { code: 'ENOENT' })
    resolveApproval('rejected')
    assert.equal((await pending).isError, true)
    await assert.rejects(readFile(marker), { code: 'ENOENT' })
    decision = Promise.resolve('allowed-once')
    assert.equal((await execute(ctx, args, agent)).isError, false)
    assert.equal(await readFile(marker, 'utf8'), 'sent\n')
    decision = Promise.resolve('rejected')
    assert.equal((await execute(ctx, args, agent)).isError, true)
    assert.equal(requests, 3)
    assert.equal(await readFile(marker, 'utf8'), 'sent\n')
    for (const text of ['--help', '--dry-run']) {
      assert.equal((await execute(ctx, { ...args, args: ['message', 'aibot', 'send', '--text', text] }, agent)).isError, true)
    }
    assert.equal(requests, 5)
    assert.equal((await execute(ctx, { ...args, dry_run: true }, agent)).isError, false)
    for (const text of ['--dry-run', undefined]) {
      assert.equal((await execute(ctx, { ...args, args: ['message', 'aibot', 'send', '--text', ...(text ? [text] : [])], dry_run: true }, agent)).isError, false)
    }
    assert.equal(requests, 5)
    assert.equal(await readFile(marker, 'utf8'), 'sent\n')
    assert.equal((await execute(ctx, args)).isError, true)
    assert.equal(requests, 5)
  } finally {
    await fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('trusted executor is lifecycle-bound, receives native session context, and never falls back locally', async () => {
  const ctx = await runtime()
  const fiber = await ctx.plugin(OfficePlugin, { executorService: 'fixtureOfficeExecutor', wecomCommand: process.execPath })
  const tick = () => new Promise(resolve => setTimeout(resolve, 20))
  assert.deepEqual(ctx.tools.schemas(), [])
  assert.deepEqual(await ctx.skills.list(), [])
  /** @type {Array<{ risk: string }>} */ const calls = []
  const agent = { session: { header: { id: 'synthetic-private-session', cwd: tmpdir() } } }
  let fail = false
  const executor = {
    /** @param {{ risk: string }} request @param {{ agent?: unknown }} exec */
    async run(request, exec) {
      assert.equal(exec.agent, agent)
      if (fail) throw new Error('Synthetic broker failure')
      calls.push(request)
      return { exitCode: 0, signal: null, stdout: 'synthetic remote result', stderr: '', truncated: false, timedOut: false, aborted: false, durationMs: 0 }
    },
    /** @param {string} platform */
    async inspect(platform) {
      return { platform, available: true, source: 'trusted fixture', version: 'fixture', error: '', install: '', auth: '' }
    },
  }
  const provider = {
    name: 'fixture-office-executor',
    /** @param {Context} scope */
    apply(scope) { scope.provide('fixtureOfficeExecutor', executor) },
  }
  let service = await ctx.plugin(provider)
  try {
    await tick()
    assert.equal(ctx.tools.schemas().length, 2)
    assert.equal((await ctx.skills.list()).length, 1)
    const args = { platform: 'wecom', args: ['--version'], purpose: 'Synthetic remote read' }
    const result = await execute(ctx, args, agent)
    assert.equal(result.isError, false)
    assert.match(JSON.stringify(result), /synthetic remote result/)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].risk, 'read')
    fail = true
    const failed = await execute(ctx, args, agent)
    assert.equal(failed.isError, true)
    assert.match(JSON.stringify(failed), /Synthetic broker failure/)
    await service.dispose()
    await tick()
    assert.deepEqual(ctx.tools.schemas(), [])
    assert.deepEqual(await ctx.skills.list(), [])
    service = await ctx.plugin(provider)
    await tick()
    assert.equal(ctx.tools.schemas().length, 2)
    assert.equal((await ctx.skills.list()).length, 1)
    await fiber.dispose()
    assert.deepEqual(ctx.tools.schemas(), [])
    assert.deepEqual(await ctx.skills.list(), [])
  } finally {
    await service.dispose()
    await fiber.dispose()
  }
})
