// The command bar. Ctrl+K opens it on commands, `/` on search, and so does pressing Space twice
// outside a text field. While open it owns the keyboard: Escape closes it and bare keys type
// into its field.

import type { Context } from '@neoworks/extension-system'
import { isTyping, KeyPriority, type KeyEventInput } from '../../kernel/keymap/service'
import { createDoubleTap } from './doubleTap'
import { paletteCommands } from './entries'
import Palette from './Palette.svelte'
import { closePalette, createPaletteState, openPalette, type PaletteState } from './state.svelte'

/** Two Space presses at most this far apart open the bar. */
const DOUBLE_SPACE_MS = 350

export const palette = {
	name: 'palette',
	inject: ['slots', 'commands', 'keymap', 'sidecar', 'accounts', 'mailbox', 'reader'],
	apply(ctx: Context) {
		const state = createPaletteState()
		ctx.slots.register('overlays', {
			id: 'palette',
			order: 30,
			component: Palette,
			props: {
				palette: state,
				commands: () => paletteCommands(ctx),
				search: (term: string, semantic: boolean) => searchMail(ctx, term, semantic),
				openResult: (result: { accountId: number; threadId: number }) =>
					void ctx.reader.openThread(result.accountId, result.threadId)
			}
		})
		registerCommands(ctx, state)
		ctx.keymap.subscribe(KeyPriority.overlay, (event) => handleOpenKey(state, event))
		ctx.keymap.subscribe(KeyPriority.app, doubleSpaceHandler(state))
	}
}

function registerCommands(ctx: Context, state: PaletteState): void {
	ctx.commands.register({
		id: 'palette.open',
		title: 'Open command bar',
		group: 'View',
		run: () => {
			if (state.open) {
				closePalette(state)
				return
			}
			openPalette(state, '>')
		}
	})
	ctx.commands.register({
		id: 'palette.search',
		title: 'Search mail',
		group: 'View',
		run: () => openPalette(state, '')
	})
	ctx.keymap.bind({ command: 'palette.open', combo: { key: 'k', ctrl: true } })
	ctx.keymap.bind({ command: 'palette.search', combo: { key: '/' } })
}

function searchMail(ctx: Context, term: string, semantic: boolean) {
	const accountId = ctx.accounts.state.selectedAccountId
	if (semantic) return ctx.sidecar.call('search.semantic', term, accountId)
	return ctx.sidecar.call('search.text', term, accountId)
}

function handleOpenKey(state: PaletteState, event: KeyEventInput): boolean {
	if (!state.open) return false
	if (event.key === 'Escape') {
		event.preventDefault()
		closePalette(state)
		return true
	}
	return !(event.ctrl || event.alt || event.meta)
}

function doubleSpaceHandler(state: PaletteState): (event: KeyEventInput) => boolean {
	const doubleSpace = createDoubleTap(DOUBLE_SPACE_MS)
	return (event) => {
		if (event.key !== ' ' || event.ctrl || event.alt || event.meta || isTyping()) return false
		event.preventDefault()
		if (doubleSpace.press(Date.now())) openPalette(state, '')
		return true
	}
}
