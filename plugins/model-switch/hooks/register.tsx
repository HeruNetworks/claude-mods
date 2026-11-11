import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const MODELS = [
  { cmd: 'opus', id: 'claude-opus-5-5', name: 'Opus 5.5', note: 'best' },
  { cmd: 'sonnet', id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', note: 'fast, cheaper' },
  { cmd: 'haiku', id: 'claude-haiku-5-5', name: 'Haiku 5.5', note: 'quickest' },
  { cmd: 'fable', id: 'claude-fable-5-2', name: 'Fable 5.2', note: 'most capable' },
] as const

const EFFORTS = ['low', 'medium', 'high', 'max'] as const
const DEFAULT_EFFORT = 'medium'

type Model = (typeof MODELS)[number]

const PANE = 'model-switch'

// Bumped after each switch so the band and pane redraw.
const tick = atom({ plugin: 'model-switch', key: 'tick' } as const, 0)
const effort = atom({ plugin: 'model-switch', key: 'effort' } as const, DEFAULT_EFFORT)

function nameOf(id: string): string {
  return MODELS.find(m => id.includes(m.cmd))?.name ?? id
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

async function setEffort($: EngineInterface, level: string): Promise<void> {
  try {
    await $.command.run({ command: 'effort', args: level })
    await update($, effort, () => level)
    $.ui.toast(`Effort: ${cap(level)}`)
  } catch (err) {
    $.ui.toast(`Could not set effort: ${String((err as Error)?.message ?? err)}`)
  }
}

// Switches model, then sets effort to medium so it is one tap.
async function switchTo($: EngineInterface, m: Model): Promise<string> {
  try {
    await $.command.run({ command: 'model', args: m.id })
    await $.command.run({ command: 'effort', args: DEFAULT_EFFORT })
    await update($, effort, () => DEFAULT_EFFORT)
  } catch (err) {
    $.ui.toast(`Could not switch to ${m.name}: ${String((err as Error)?.message ?? err)}`)
    return $.session.model()
  }
  await update($, tick, n => n + 1)
  const now = await $.session.model()
  $.ui.toast(
    now.includes(m.cmd)
      ? `Now on ${m.name}, effort ${cap(DEFAULT_EFFORT)}`
      : `Asked for ${m.name}; still on ${nameOf(now)}`,
  )
  return now
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    for (const m of MODELS) {
      await $.command.register({ name: m.cmd, description: `Switch to ${m.name} (${m.note}), effort medium` })
    }
    await $.command.register({ name: 'models', description: 'Show the model switch buttons' })
    void $.ui.open({ id: PANE, title: 'Model' })
    return next(e)
  })

  on('command.run', { command: 'models' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Model' })
    return { text: `Model: ${nameOf(await $.session.model())}` }
  })

  for (const m of MODELS) {
    on('command.run', { command: m.cmd }, async $ => {
      // /model cannot run inside this command, so run it just after.
      $.clock.after(10, () => void switchTo($, m))
      return { text: `Switching to ${m.name}...` }
    })
  }

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await read($, tick)
    const now = await $.session.model()
    const level = await read($, effort)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text bold>Now: {nameOf(now)} · {cap(level)}</Text>
        {MODELS.map(m => {
          const active = now.includes(m.cmd)
          return (
            <Button
              key={m.cmd}
              label={`${active ? '● ' : ''}${m.name} - ${m.note}`}
              variant={active ? 'primary' : 'secondary'}
              onPress={() => { if (!active) void switchTo($, m) }}
            />
          )
        })}
        <Text dimColor>Effort</Text>
        <Box>
          {EFFORTS.map(l => (
            <Button
              key={`effort-${l}`}
              label={l === level ? `● ${cap(l)}` : cap(l)}
              variant={l === level ? 'primary' : 'secondary'}
              onPress={() => { if (l !== level) void setEffort($, l) }}
            />
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    await read($, tick)
    const now = await $.session.model()
    const level = await read($, effort)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>Model: </Text>
        {MODELS.map(m => {
          const active = now.includes(m.cmd)
          return (
            <Button
              key={m.cmd}
              label={active ? `● ${m.name}` : m.name}
              variant={active ? 'primary' : 'secondary'}
              dimColor={!active}
              onPress={() => { if (!active) void switchTo($, m) }}
            />
          )
        })}
        <Text dimColor> · {cap(level)}</Text>
      </Box>
    )
  })
}
