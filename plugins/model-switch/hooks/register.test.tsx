import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'model-switch', component: 'Pane', requestId: 'model-switch',
  props: { title: 'Model', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('pane shows the active model and a tap switches', async ($, on) => {
  let model = 'claude-opus-5-5'
  const ran: string[] = []
  on('session.model', () => ({ value: model }))
  on('command.run', (_, e) => {
    if (e.command === 'model') model = e.args
    if (e.command === 'model' || e.command === 'effort') ran.push(e.args)
    return { text: '' }
  })
  on('ui.toast', () => ({ value: undefined }))

  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect((await ui.find({ type: 'Text', text: /Now/ }))?.text).toBe('Now: Opus 5.5 · Medium')
  await ui.press({ key: 'sonnet' })
  expect(ran).toEqual(['claude-sonnet-5-5', 'medium'])
  await ui.press({ key: 'effort-high' })
  expect(ran).toEqual(['claude-sonnet-5-5', 'medium', 'high'])
  await ui.unmount()
})

test('/haiku switches', async ($, on) => {
  let model = 'claude-opus-5-5'
  on('session.model', () => ({ value: model }))
  on('command.run', (_, e) => { if (e.command === 'model') model = e.args; return { text: '' } })
  const toasts: string[] = []
  on('ui.toast', (_, e) => { toasts.push(JSON.stringify(e)); return { value: undefined } })
  on('clock.after', () => ({ value: undefined }))
  const r = await $.command.run({ command: 'haiku', args: '' } as any)
  expect(r.text).toBe('Switching to Haiku 5.5...')
  await new Promise(r => (globalThis as any).setTimeout(r, 100))
  expect(model).toBe('claude-haiku-5-5')
  expect(toasts).toEqual(['{"text":"Now on Haiku 5.5, effort Medium"}'])
})
