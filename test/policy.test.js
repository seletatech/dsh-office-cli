import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyRisk, evaluateRequest, executionArgs } from '../src/policy.js'

const config = {
  maxArgs: 16,
  maxArgLength: 1000,
  allowRawApi: false,
  workspaceFilesOnly: true,
}

test('classifies representative vendor commands', () => {
  assert.equal(classifyRisk(['calendar', '+agenda']), 'read')
  assert.equal(classifyRisk(['im', '+messages-send', '--text', 'hello']), 'write')
  assert.equal(classifyRisk(['todo', 'delete', '--id', '1']), 'destructive')
  assert.equal(classifyRisk(['unknown', 'operation']), 'write')
  assert.equal(classifyRisk(['docs', '+fetch', '--doc', 'fixture']), 'read')
  assert.equal(classifyRisk(['im', '+messages-mget', '--message-ids', 'om_fixture']), 'read')
  assert.equal(classifyRisk(['unknown', 'fetch']), 'write')
  assert.equal(classifyRisk(['docs', '+fetch', 'send']), 'write')
})

test('dry-run downgrades mutations to read risk', () => {
  const result = evaluateRequest('feishu', ['im', '+messages-send', '--text', 'hello'], true, '/workspace', config)
  assert.deepEqual(result, { allowed: true, risk: 'read', reason: 'dry-run does not send the mutation' })
})

test('option values cannot impersonate help, read verbs or a preview flag', () => {
  for (const value of ['--help', '-h', '--version', '-V', '--dry-run', 'list']) {
    assert.equal(evaluateRequest('feishu', ['im', '+messages-send', '--text', value], false, '/workspace', config).risk, 'write')
    assert.equal(classifyRisk(['unknown', 'operation', '--text', value]), 'write')
  }
  assert.equal(classifyRisk(['im', '+messages-send', '--help']), 'read')
  assert.equal(classifyRisk(['--version']), 'read')
  assert.deepEqual(executionArgs(['im', '+messages-send', '--text', '--dry-run'], true), ['im', '+messages-send', '--dry-run', '--text', '--dry-run'])
  assert.deepEqual(executionArgs(['im', '+messages-send', '--text'], true), ['im', '+messages-send', '--dry-run', '--text'])
  for (const flag of ['--dry-run=false', '--']) assert.equal(evaluateRequest('feishu', ['im', '+messages-send', flag], true, '/workspace', config).allowed, false)
})

test('blocks auth, raw APIs, long-running commands, and credential flags', () => {
  assert.equal(evaluateRequest('wecom', ['auth', 'init'], false, '/workspace', config).allowed, false)
  assert.equal(evaluateRequest('feishu', ['api', 'GET', '/open-apis/me'], false, '/workspace', config).allowed, false)
  assert.equal(evaluateRequest('dingtalk', ['event', 'consume'], false, '/workspace', config).allowed, false)
  assert.equal(evaluateRequest('feishu', ['im', 'send', '--app-secret', 'hidden'], false, '/workspace', config).allowed, false)
  assert.equal(evaluateRequest('wecom', ['doc', 'get', 'CLIENT_SECRET=hidden'], false, '/workspace', config).allowed, false)
})

test('allows workspace-relative files and rejects escaping paths', () => {
  assert.equal(evaluateRequest('feishu', ['drive', 'upload', '--file', 'artifacts/report.pdf'], false, '/workspace', config).allowed, true)
  assert.equal(evaluateRequest('feishu', ['drive', 'upload', '--file=../secret.txt'], false, '/workspace', config).allowed, false)
  assert.equal(evaluateRequest('wecom', ['doc', 'get', 'https://example.com/path'], false, '/workspace', config).allowed, true)
})

test('raw API can be explicitly enabled but remains approval-worthy', () => {
  const result = evaluateRequest('dingtalk', ['api', 'GET', '/v1.0/contact/users'], false, '/workspace', {
    ...config,
    allowRawApi: true,
  })
  assert.equal(result.allowed, true)
  assert.equal(result.risk, 'read')
})
