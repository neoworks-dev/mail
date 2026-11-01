// The frame: fills the kernel's `root` slot with the window's layout and declares the slots the
// other plugins draw into.
//
// - `navigation` (list): side by side in the left surface, such as folders and the message list.
// - `content` (single): the reading area.
// - `aside` (list): panes right of the reading area, such as the assistant.
// - `overlays` (list): drawn above everything, such as the composer, the palette and toasts.
// - `onboarding` (single): the whole window while no account exists.
//
// It also lets the reading area take the whole window, with `f` or the button it adds to the
// thread's toolbar.

import type { Context } from '@neoworks/extension-system'
import FocusToggle from './FocusToggle.svelte'
import Frame from './Frame.svelte'
import { READER_FOCUSED_SETTING } from './layout'

const LIST_SLOTS = ['navigation', 'aside', 'overlays']
const SINGLE_SLOTS = ['content', 'onboarding']

export const frame = {
	name: 'frame',
	inject: ['slots', 'accounts', 'reader', 'commands', 'keymap', 'settings'],
	apply(ctx: Context) {
		for (const name of LIST_SLOTS) ctx.slots.declare(name, 'list')
		for (const name of SINGLE_SLOTS) ctx.slots.declare(name, 'single')
		ctx.slots.register('root', {
			id: 'frame',
			component: Frame,
			props: { accounts: ctx.accounts, reader: ctx.reader }
		})
		ctx.commands.register({
			id: 'frame.toggleReaderFocus',
			title: 'Toggle full-width reading',
			group: 'View',
			when: () => ctx.reader.openThreadId !== null,
			run: () => {
				const focused = ctx.settings.get(READER_FOCUSED_SETTING, false)
				ctx.settings.set(READER_FOCUSED_SETTING, !focused)
			}
		})
		ctx.keymap.bind({ command: 'frame.toggleReaderFocus', combo: { key: 'f' } })
		ctx.slots.register('thread.actions', {
			id: 'frame.focus',
			order: 100,
			component: FocusToggle,
			props: { commands: ctx.commands, settings: ctx.settings }
		})
	}
}
