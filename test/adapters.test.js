import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ADAPTERS, PLATFORMS, packageSpec, resolveCommand } from '../src/adapters.js'

test('declares all three official CLI adapters', () => {
  assert.deepEqual(PLATFORMS, ['wecom', 'dingtalk', 'feishu'])
  assert.equal(ADAPTERS.wecom.packageName, '@wecom/cli')
  assert.equal(ADAPTERS.dingtalk.packageName, 'dingtalk-workspace-cli')
  assert.equal(ADAPTERS.feishu.packageName, '@larksuite/cli')
  assert.equal(packageSpec('wecom'), '@wecom/cli@1.1.0')
})

test('a configured executable takes precedence and is never shell-split', () => {
  const resolved = resolveCommand('feishu', '/opt/My Tools/lark-cli')
  assert.deepEqual(resolved, {
    command: '/opt/My Tools/lark-cli',
    prefixArgs: [],
    displayCommand: '/opt/My Tools/lark-cli',
    source: 'configured',
  })
})

test('resolves a CLI from the managed DSH office directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-office-adapter-'))
  const bin = join(root, 'node_modules', '@wecom', 'cli', 'bin', 'wecom.js')
  await mkdir(join(root, 'node_modules', '@wecom', 'cli', 'bin'), { recursive: true })
  await writeFile(bin, '')
  const previous = process.env.DSH_OFFICE_HOME
  process.env.DSH_OFFICE_HOME = root
  try {
    assert.deepEqual(resolveCommand('wecom', undefined), {
      command: process.execPath,
      prefixArgs: [bin],
      displayCommand: 'wecom-cli',
      source: 'managed',
    })
  } finally {
    if (previous === undefined) delete process.env.DSH_OFFICE_HOME
    else process.env.DSH_OFFICE_HOME = previous
    await rm(root, { recursive: true })
  }
})
