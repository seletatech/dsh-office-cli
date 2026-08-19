// @ts-check

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const PROVIDER_NAME = 'dsh-office-cli'
const SKILL_NAME = 'dsh-office-cli'
const SKILL_URL = new URL('../skills/dsh-office-cli/SKILL.md', import.meta.url)
const RESOURCE_BASE = Object.freeze({
  kind: /** @type {const} */ ('directory'),
  path: fileURLToPath(new URL('../skills/dsh-office-cli/', import.meta.url)),
})
const INVOCATION = Object.freeze({ modelInvocable: true, userInvocable: true })
const DESCRIPTION = 'Operate enterprise WeCom, DingTalk, and Feishu/Lark through their official CLIs from DeepSeek Harness. Use for office messages, contacts, documents, sheets, calendars, meetings, tasks, approvals, mail, and related workspace operations.'

const CANDIDATE = Object.freeze({
  name: SKILL_NAME,
  description: DESCRIPTION,
  invocation: INVOCATION,
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: 600,
  locator: SKILL_URL,
})

const provider = Object.freeze({
  name: PROVIDER_NAME,
  list: () => Promise.resolve([CANDIDATE]),
  get: async () => ({
    name: CANDIDATE.name,
    description: CANDIDATE.description,
    invocation: CANDIDATE.invocation,
    provider: CANDIDATE.provider,
    source: CANDIDATE.source,
    resourceBase: RESOURCE_BASE,
    content: await readFile(SKILL_URL, 'utf8'),
  }),
})

/**
 * @param {{ registerProvider(create: () => unknown): unknown }} skills
 */
export function registerOfficeSkill(skills) {
  skills.registerProvider(() => provider)
}
