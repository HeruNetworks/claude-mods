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
const HUMAN = ['composer', 'bridge']

let brainName = ''
let remoteName = 'claude-code-remote'
let briefing = ''
let title = ''
let remoteId = ''
let localId = ''
let isRegistered = false
let isBriefingHandedOver = false
let titleNote = ''
let isBriefingInInstructions = false

const DEBUG_PATH = '/tmp/heru-brain-debug.log'
let debugText = ''
async function dbg($: EngineInterface, line: string): Promise<void> {
  if (!DEBUG_PATH) return
  debugText += `${line}\n`
  try { await $.fs.write(DEBUG_PATH, debugText) } catch { /* debug only */ }
}

type Reply = Record<string, unknown> | null

function parse(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : { text }
  } catch {
    return { text }
  }
}

// One connector tool call, two roads. First by the tool's full name, the way the chat itself calls it
// (this works whatever the connector is listed as); then by server name. Timed, and never throws.
async function callServer($: EngineInterface, server: string, tool: string, args: Record<string, unknown>, ms: number): Promise<Reply> {
  const timedOut = { timedOut: true } as const
  const attempt = async (): Promise<Reply> => {
    try {
      const ran = (await $.tool.call({ tool: `mcp__${server}__${tool}`, ...args } as never)) as { deny?: string; isError?: boolean; text?: string; result?: unknown }
      if (ran.deny === undefined && ran.isError !== true) {
        const text = typeof ran.text === 'string' && ran.text ? ran.text : typeof ran.result === 'string' ? ran.result : JSON.stringify(ran.result ?? '')
        await dbg($, `tool ${server}.${tool}: ok ${text.slice(0, 100)}`)
        return parse(text)
      }
      await dbg($, `tool ${server}.${tool}: ${ran.deny !== undefined ? `deny ${ran.deny}` : `isError ${JSON.stringify(ran.result ?? '').slice(0, 200)}`}`)
    } catch (err) {
      await dbg($, `tool ${server}.${tool}: threw ${String((err as Error)?.message ?? err).slice(0, 200)}`)
    }
    try {
      const result = await $.mcp.call(server, tool, args)
      if (!result.isError) {
        const text = result.content.map(block => (block.type === 'text' ? (block.text ?? '') : '')).join('')
        await dbg($, `mcp ${server}.${tool}: ok ${text.slice(0, 100)}`)
        return parse(text)
      }
      await dbg($, `mcp ${server}.${tool}: isError ${JSON.stringify(result.content).slice(0, 200)}`)
    } catch (err) {
      await dbg($, `mcp ${server}.${tool}: threw ${String((err as Error)?.message ?? err).slice(0, 200)}`)
    }
    return null
  }
  const result = await Promise.race([attempt(), $.clock.sleep(ms).then(() => timedOut).catch(() => timedOut)])
  if (result !== null && 'timedOut' in result && result.timedOut === true && Object.keys(result).length === 1) {
    await dbg($, `call ${server}.${tool}: timed out`)
    return null
  }
  return result as Reply
}

async function brain($: EngineInterface, tool: string, args: Record<string, unknown>, ms = 12000): Promise<Reply> {
  for (const name of brainName ? [brainName, ...BRAIN_NAMES] : BRAIN_NAMES) {
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

// A connector is not always listed under its plain name: a chat opened by another chat lists the Heru Brain
// under an id. So the server is read from the chat's own tool names (mcp__<server>__brain_start).
function learnServers(names: readonly string[]): void {
  for (const name of names) {
    const brainMatch = /^mcp__(.+)__brain_start$/.exec(name)
    if (brainMatch?.[1]) brainName = brainMatch[1]
    const remoteMatch = /^mcp__(.+)__set_session_title$/.exec(name)
    if (remoteMatch?.[1]) remoteName = remoteMatch[1]
  }
}

async function identify($: EngineInterface): Promise<void> {
  if (!brainName) {
    try { learnServers((await $.tool.list()).map(tool => tool.name)) } catch { /* fall back to the plain names */ }
    if (!brainName) {
      // Connector tools that are not loaded yet are not in the list: ask the chat's own tool search for the name.
      try {
        const found = (await $.tool.call({ tool: 'ToolSearch', query: 'brain_start', max_results: 3 } as never)) as unknown
        const match = /mcp__([A-Za-z0-9_. -]+?)__brain_start/.exec(JSON.stringify(found ?? ''))
        if (match?.[1]) brainName = match[1]
      } catch { /* fall back to the plain names */ }
    }
    await dbg($, `servers brain=${brainName} remote=${remoteName}`)
  }
  if (!localId) { try { localId = await $.session.id() } catch { localId = '' } }
  if (remoteId) return
  const self = await callServer($, remoteName, 'get_session', {}, 8000)
  const found = /session_[A-Za-z0-9]{10,}/.exec(JSON.stringify(self ?? {}))
  remoteId = found ? found[0] : ''
}

// The briefing: asked for as early as the session allows, and again at the first message if the Brain
// connector was not ready yet.
async function fetchBriefing($: EngineInterface): Promise<void> {
  if (briefing) return
  const brief = await brain($, 'brain_brief', { client: 'heru-brain mod' })
  if (brief !== null && typeof brief.brief === 'string' && brief.brief) {
    briefing = `${brief.brief}\n\nRECORDER: on. Mario's messages, your final replies and app releases are saved by code. Wrap still matters for decisions and corrections.`
  }
}

// Registration and the dated title: only on the first message of a new chat.
async function registerChat($: EngineInterface, firstMessage: string): Promise<void> {
  let turns = 0
  try { turns = await $.session.turns() } catch { turns = 0 }
  if (turns > 3) { isRegistered = true; return }
  const registered = await brain($, 'brain_start', {
    message: firstMessage.slice(0, 1500),
    project: 'none',
    client: 'Claude Code (heru-brain mod)',
    agent: 'claude',
    session_id: remoteId || localId,
    ...(remoteId ? { chat_url: `https://claude.ai/code/${remoteId}` } : {}),
  })
  if (registered === null || typeof registered.title !== 'string' || !registered.title) return
  title = registered.title
  isRegistered = true
  let isRenamed = false
  if (remoteId) isRenamed = (await callServer($, remoteName, 'set_session_title', { session_id: remoteId, title }, 8000)) !== null
  const parts = [
    `THIS CHAT IS ALREADY REGISTERED WITH THE HERU BRAIN BY CODE. Title: "${title}"${isRenamed ? ' (the chat has been renamed to it)' : ' (rename the chat to it if you can, else tell Mario the title in one line)'}. brain_start has been run for you: do NOT call it again, even if your instructions say to call it first. If the title does not fit what Mario asked, rename the chat yourself, keeping the date at the front.`,
  ]
  const index = lines(registered.task_index, 20)
  if (index) parts.push(`TASK INDEX (call brain_route with the task before you start it):\n${index}`)
  const open = lines(registered.open_items, 6)
  if (open) parts.push(`OPEN BOARD ITEMS NEAR THIS CHAT:\n${open}`)
  titleNote = parts.join('\n\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await identify($)
      await fetchBriefing($)
    } catch { /* the chat carries on */ }
    await dbg($, `session.start heru-brain 0.1.4 brain=${brainName} remote=${remoteName} id=${remoteId} briefing=${briefing.length}`)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await dbg($, `prompt.submit meta=${String(e.isMeta)} origin=${e.origin.kind} briefing=${briefing.length} registered=${String(isRegistered)} inInstructions=${String(isBriefingInInstructions)}`)
    if (e.isMeta === true || e.command !== undefined || !e.text.trim()) return next(e)
    const isHuman = HUMAN.includes(e.origin.kind)
    const extra: string[] = []
    if (!briefing || !isRegistered) {
      // The Brain connector can still be connecting when the first message is sent: try a few times, then
      // carry on and try again on the next message. Nothing here can stop the message.
      try {
        const tries = briefing ? 1 : 4
        for (let attempt = 0; attempt < tries; attempt++) {
          await identify($)
          await fetchBriefing($)
          if (briefing) break
          if (attempt < tries - 1) await $.clock.sleep(2500)
        }
        if (briefing && !isRegistered) {
          await registerChat($, e.text)
          if (titleNote) extra.push(titleNote)
        }
      } catch { /* the chat carries on without a briefing */ }
    }
    // The instructions were put together before the briefing arrived: hand it over with this message instead.
    if (briefing && !isBriefingInInstructions && !isBriefingHandedOver) {
      isBriefingHandedOver = true
      extra.push(briefing)
    }
    await record($, isHuman ? 'user' : 'tool', e.text, { origin: e.origin.kind })
    return extra.length > 0 ? next({ ...e, context: [...(e.context ?? []), ...extra] }) : next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!brainName) learnServers(e.tools)
    await dbg($, `prompt.compose sections=${composed.sections.length} briefing=${briefing.length}`)
    if (!briefing) return composed
    isBriefingInInstructions = true
    return { ...composed, sections: [...composed.sections, { id: 'heru-briefing', text: briefing, scope: 'session' as const }] }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await dbg($, `turn.complete agent=${String(e.agentId)} reason=${e.reason} answer=${e.answer.length}`)
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
