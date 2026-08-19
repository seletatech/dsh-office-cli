import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as OfficePlugin from '../src/index.js'

test('loads into real Cordis registries and disposes cleanly', async () => {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
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

  const result = await ctx.tools.execute({
    callId: /** @type {any} */ ('office-test-call'),
    name: 'office_cli',
    arguments: {
      platform: 'wecom',
      args: ['--version'],
      purpose: 'Verify the shell-free plugin execution path',
    },
    signal: new AbortController().signal,
  })
  assert.equal(result.isError, false)
  assert.match(result.content[0]?.type === 'text' ? result.content[0].text : '', /wecom completed/)

  await fiber.dispose()
  assert.deepEqual(ctx.tools.schemas(), [])
  assert.deepEqual(await ctx.skills.list(), [])
})
