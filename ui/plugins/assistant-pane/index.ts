// The assistant pane beside the reading area: the neo agent's current session as a chat, with
// an input to ask it about mail. It shows while the `assistant.open` setting is on, which
// `assistant.toggle` (Ctrl+Shift+A, or the header's button) flips.

import type { Context } from '@neoworks/extension-system'
import AssistantPane from './AssistantPane.svelte'

export const OPEN_SETTING = 'assistant.open'

export const assistantPane = {
	name: 'assistant-pane',
	inject: ['slots', 'commands', 'keymap', 'settings', 'sidecar', 'assistant'],
	apply(ctx: Context) {
		ctx.slots.register('aside', {
			id: 'assistant-pane',
			component: AssistantPane,
			props: { assistant: ctx.assistant, settings: ctx.settings, sidecar: ctx.sidecar }
		})
		ctx.commands.register({
			id: 'assistant.toggle',
			title: 'Toggle assistant',
			group: 'Assistant',
			run: () => {
				ctx.settings.set(OPEN_SETTING, !ctx.settings.get(OPEN_SETTING, false))
			}
		})
		ctx.keymap.bind({ command: 'assistant.toggle', combo: { key: 'a', ctrl: true, shift: true } })
	}
}
