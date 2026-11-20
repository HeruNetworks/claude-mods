// heru-brain: no chat starts blank, and nothing is lost when a chat closes.
// 20 Nov 2026 (Mario, Autopilot plan). Everything here is done by code, so it does not depend on a chat
// remembering a rule:
//   1. START: on the first message the chat is registered with the Heru Brain, renamed to the dated title,
//      and the BRIEFING (company facts, hard lines, what is waiting on Mario, the last 48 hours, live app
//      versions) is put into the chat's instructions.
//   2. RECORDER: every message from Mario, every final reply and every app release is sent to the Brain.
// Calls go through the chat's own Heru Brain connector ($.mcp.call), so there are no keys in this file.
// Every call is wrapped and timed: a slow or missing Brain never holds up or breaks a chat.
import type { EngineInterface, Register } from 'claude-code'

const BRAIN_NAMES = ['Heru_Brain', 'Heru Brain', 'claude.ai Heru Brain', 'claude_ai_Heru_Brain']
const REMOTE = 'claude-code-remote'
const HUMAN = ['composer', 'bridge']

let brainName = ''
let briefing = ''
let title = ''
let remoteId = ''
let localId = ''
let isStarted = false

type Reply = Record<string, unknown> | null

async function callServer($: EngineInterface, server: string, tool: string, args: Record<string, unknown>, ms: number): Promise<Reply> {
  const timedOut = { timedOut: true } as const
  const result = await Promise.race([
    $.mcp.call(server, tool, args).catch(() => null),
    $.clock.sleep(ms).then(() => timedOut).catch(() => timedOut),
  ])
  if (result === null || 'timedOut' in result || result.isError) return null
  const text = result.content.map(block => (block.type === 'text' ? (block.text ?? '') : '')).join('')
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : { text }
  } catch {
    return { text }
  }
}

async function brain($: EngineInterface, tool: string, args: Record<string, unknown>, ms = 12000): Promise<Reply> {
  for (const name of brainName ? [brainName] : BRAIN_NAMES) {
    const reply = await callServer($, name, tool, args, ms)
    if (reply !== null) {
      brainName = name
      return reply
    }
  }
  return null
}

async function record($: EngineInterface, kind: string, text: string, meta?: Record<string, unknown>): Promise<void> {
  if (!text.trim()) return
  try {
    await brain($, 'brain_record', { kind, text: text.slice(0, 11000), session_id: remoteId || localId, title, meta }, 8000)
  } catch {
    // the chat carries on
  }
}

function lines(value: unknown, max: number): string {
  return Array.isArray(value) ? value.slice(0, max).map(item => `- ${String(item)}`).join('\n') : ''
}

async function start($: EngineInterface, firstMessage: string): Promise<void> {
  try { localId = await $.session.id() } catch { localId = '' }
  let turns = 0
  try { turns = await $.session.turns() } catch { turns = 0 }
  const isFresh = turns <= 1

  const self = await callServer($, REMOTE, 'get_session', {}, 8000)
  const found = /session_[A-Za-z0-9]{10,}/.exec(JSON.stringify(self ?? {}))
  remoteId = found ? found[0] : ''

  const [registered, brief] = await Promise.all([
    isFresh
      ? brain($, 'brain_start', {
          message: firstMessage.slice(0, 1500),
          project: 'none',
          client: 'Claude Code (heru-brain mod)',
          agent: 'claude',
          session_id: remoteId || localId,
          ...(remoteId ? { chat_url: `https://claude.ai/code/${remoteId}` } : {}),
        })
      : Promise.resolve(null),
    brain($, 'brain_brief', { client: 'heru-brain mod' }),
  ])

  const parts: string[] = []
  if (registered !== null && typeof registered.title === 'string' && registered.title) {
    title = registered.title
    let isRenamed = false
    if (remoteId) isRenamed = (await callServer($, REMOTE, 'set_session_title', { session_id: remoteId, title }, 8000)) !== null
    parts.push(
      `THIS CHAT IS ALREADY REGISTERED WITH THE HERU BRAIN BY CODE. Title: "${title}"${isRenamed ? ' (the chat has been renamed to it)' : ' (rename the chat to it if you can, else tell Mario the title in one line)'}. brain_start has been run for you: do NOT call it again, even if your instructions say to call it first. If Mario's first message shows the title is wrong, rename the chat yourself, keeping the date at the front.`,
    )
    const index = lines(registered.task_index, 20)
    if (index) parts.push(`TASK INDEX (call brain_route with the task before you start it):\n${index}`)
    const open = lines(registered.open_items, 6)
    if (open) parts.push(`OPEN BOARD ITEMS NEAR THIS CHAT:\n${open}`)
  }
  if (brief !== null && typeof brief.brief === 'string' && brief.brief) parts.push(brief.brief)
  if (parts.length > 0) {
    parts.push('RECORDER: on. Mario\'s messages, your final replies and app releases are saved by code. Wrap still matters for decisions and corrections.')
    briefing = parts.join('\n\n')
  }
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (e.isMeta === true || e.command !== undefined || !e.text.trim()) return next(e)
    const isHuman = HUMAN.includes(e.origin.kind)
    if (!isStarted) {
      isStarted = true
      try { await start($, e.text) } catch { /* the chat carries on without a briefing */ }
    }
    await record($, isHuman ? 'user' : 'tool', e.text, { origin: e.origin.kind })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!briefing) return composed
    return { ...composed, sections: [...composed.sections, { id: 'heru-briefing', text: briefing, scope: 'session' as const }] }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && e.reason === 'answer' && e.answer) await record($, 'assistant', e.answer)
    return done
  })

  on('tool.call', { tool: 'mcp__Hatchable__deploy' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      const input = e as unknown as Record<string, unknown>
      await record($, 'release', String(input.summary ?? input.intent ?? 'app release'), {
        project_id: input.project_id,
        summary: input.summary,
        result: String(ran.text ?? JSON.stringify(ran.result ?? '')).slice(0, 1500),
      })
    }
    return ran
  }).catch(($, e, next) => next(e))
}
