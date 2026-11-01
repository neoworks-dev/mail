// The bar above the panes: back and forward on the left, the search pill in the middle, and
// compose, the theme and the assistant on the right. Every control runs a command, so each
// works the same from here, a key or the palette.

import type { Context } from '@neoworks/extension-system'
import HeaderActions from './HeaderActions.svelte'
import HistoryButtons from './HistoryButtons.svelte'
import SearchPill from './SearchPill.svelte'

export const header = {
	name: 'header',
	inject: ['slots', 'commands', 'keymap', 'reader', 'settings'],
	apply(ctx: Context) {
		ctx.slots.register('header.start', {
			id: 'header.history',
			component: HistoryButtons,
			props: { reader: ctx.reader, commands: ctx.commands }
		})
		ctx.slots.register('header.center', {
			id: 'header.search',
			component: SearchPill,
			props: { commands: ctx.commands, keymap: ctx.keymap }
		})
		ctx.slots.register('header.end', {
			id: 'header.actions',
			component: HeaderActions,
			props: { commands: ctx.commands, settings: ctx.settings }
		})
	}
}
