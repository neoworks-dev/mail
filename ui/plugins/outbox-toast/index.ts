// Shows the sends waiting out the undo window, and the ones that failed, as toasts.

import type { Context } from '@neoworks/extension-system'
import OutboxToasts from './OutboxToasts.svelte'

export const outboxToast = {
	name: 'outbox-toast',
	inject: ['slots', 'composer'],
	apply(ctx: Context) {
		ctx.slots.register('overlays', {
			id: 'outbox-toast',
			order: 50,
			component: OutboxToasts,
			props: { composer: ctx.composer }
		})
	}
}
