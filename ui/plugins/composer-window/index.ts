// The composer window: draws the message being written over everything while there is one, and
// declares `composer.toolbar` for buttons other plugins add to its footer. While it is open it
// owns the keyboard: Escape closes it (it autosaves, so nothing is lost), Ctrl+Enter sends, and
// bare keys go to its fields instead of the app's bindings.

import type { Context } from '@neoworks/extension-system'
import { KeyPriority, type KeyEventInput } from '../../kernel/keymap/service'
import { composerActions } from './actions'
import ComposerWindow from './ComposerWindow.svelte'

export const composerWindow = {
	name: 'composer-window',
	inject: ['slots', 'keymap', 'sidecar', 'composer', 'accounts', 'assistant', 'reader'],
	apply(ctx: Context) {
		ctx.slots.declare('composer.toolbar', 'list')
		ctx.slots.register('overlays', {
			id: 'composer-window',
			order: 10,
			component: ComposerWindow,
			props: {
				composer: ctx.composer,
				accounts: ctx.accounts,
				assistant: ctx.assistant,
				actions: composerActions(ctx)
			}
		})
		ctx.keymap.subscribe(KeyPriority.overlay, (event) => handleKey(ctx, event))
	}
}

function handleKey(ctx: Context, event: KeyEventInput): boolean {
	if (ctx.composer.state.draft === null) return false
	if (event.key === 'Escape') {
		event.preventDefault()
		ctx.composer.close()
		return true
	}
	if (event.key === 'Enter' && event.ctrl) {
		event.preventDefault()
		void ctx.composer.send()
		return true
	}
	// Bare keys type into the composer's fields; only modifier combos reach the app's bindings.
	return !(event.ctrl || event.alt || event.meta)
}
