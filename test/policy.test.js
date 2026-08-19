import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyRisk, evaluateRequest } from '../src/policy.js'

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
})

test('dry-run downgrades mutations to read risk', () => {
  const result = evaluateRequest('feishu', ['im', '+messages-send', '--text', 'hello'], true, '/workspace', config)
  assert.deepEqual(result, { allowed: true, risk: 'read', reason: 'dry-run does not send the mutation' })
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
