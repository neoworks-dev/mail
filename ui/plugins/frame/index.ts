// The frame: fills the kernel's `root` slot with the window's layout and declares the slots the
// other plugins draw into.
//
// - `navigation` (list): side by side in the left surface, such as folders and the message list.
// - `content` (single): the reading area.
// - `aside` (list): panes right of the reading area, such as the assistant.
// - `overlays` (list): drawn above everything, such as the composer, the palette and toasts.
// - `onboarding` (single): the whole window while no account exists.

import type { Context } from '@neoworks/extension-system'
import Frame from './Frame.svelte'

const LIST_SLOTS = ['navigation', 'aside', 'overlays']
const SINGLE_SLOTS = ['content', 'onboarding']

export const frame = {
	name: 'frame',
	inject: ['slots', 'accounts'],
	apply(ctx: Context) {
		for (const name of LIST_SLOTS) ctx.slots.declare(name, 'list')
		for (const name of SINGLE_SLOTS) ctx.slots.declare(name, 'single')
		ctx.slots.register('root', {
			id: 'frame',
			component: Frame,
			props: { accounts: ctx.accounts }
		})
	}
}
