// The window's general controls, spread where Notion Mail keeps them since there is no bar
// above the panes: search under the sidebar's account switcher, the theme and the assistant
// along its foot, and back and forward at the start of the thread's toolbar. Every control runs
// a command, so each works the same from here, a key or the palette.

import type { Context } from '@neoworks/extension-system'
import HeaderActions from './HeaderActions.svelte'
import HistoryButtons from './HistoryButtons.svelte'
import SearchRow from './SearchRow.svelte'

export const header = {
	name: 'header',
	inject: ['slots', 'commands', 'keymap', 'reader', 'settings'],
	apply(ctx: Context) {
		ctx.slots.register('thread.navigation', {
			id: 'header.history',
			component: HistoryButtons,
			props: { reader: ctx.reader, commands: ctx.commands }
		})
		ctx.slots.register('sidebar.top', {
			id: 'header.search',
			component: SearchRow,
			props: { commands: ctx.commands, keymap: ctx.keymap }
		})
		ctx.slots.register('sidebar.footer', {
			id: 'header.actions',
			component: HeaderActions,
			props: { commands: ctx.commands, settings: ctx.settings }
		})
	}
}
