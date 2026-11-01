// The keyboard shortcuts overlay, on `?`. While a shortcut waits for its new combination, the
// recorder takes every key before anything else can act on it.

import type { Context } from '@neoworks/extension-system'
import { KeyPriority, type KeyEventInput } from '../../kernel/keymap/service'
import { comboFromEvent } from '../../lib/keycombo'
import Shortcuts from './Shortcuts.svelte'
import { createShortcutsState, type ShortcutsState } from './state.svelte'

const MODIFIER_KEYS = ['control', 'ctrl', 'shift', 'alt', 'meta', 'super', 'altgraph']

export const shortcuts = {
	name: 'shortcuts',
	inject: ['slots', 'commands', 'keymap'],
	apply(ctx: Context) {
		const state = createShortcutsState()
		ctx.slots.register('overlays', {
			id: 'shortcuts',
			order: 40,
			component: Shortcuts,
			props: { shortcuts: state, keymap: ctx.keymap }
		})
		ctx.commands.register({
			id: 'keybindings.show',
			title: 'Keyboard shortcuts',
			group: 'View',
			run: () => {
				state.open = true
			}
		})
		ctx.keymap.bind({ command: 'keybindings.show', combo: { key: '?' } })
		ctx.keymap.subscribe(KeyPriority.capture, (event) => capture(ctx, state, event))
		ctx.keymap.subscribe(KeyPriority.dialog, (event) => handleOpenKey(state, event))
	}
}

function capture(ctx: Context, state: ShortcutsState, event: KeyEventInput): boolean {
	const command = state.capturing
	if (command === null) return false
	event.preventDefault()
	event.stopPropagation()
	if (event.key === 'Escape') {
		state.capturing = null
		return true
	}
	// Wait for a real key, not a modifier pressed on its own.
	if (MODIFIER_KEYS.includes(event.key.toLowerCase())) return true
	ctx.keymap.setOverride(command, comboFromEvent(event))
	state.capturing = null
	return true
}

function handleOpenKey(state: ShortcutsState, event: KeyEventInput): boolean {
	if (!state.open) return false
	if (event.key === 'Escape') {
		event.preventDefault()
		state.open = false
		return true
	}
	return !(event.ctrl || event.alt || event.meta)
}
