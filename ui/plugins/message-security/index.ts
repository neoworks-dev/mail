// Warns above a message that may not be from who it claims: a display name naming another
// domain than the sender's, failed SPF, DKIM or DMARC checks, and a sender never seen before.

import type { Context } from '@neoworks/extension-system'
import SecurityBanner from './SecurityBanner.svelte'

export const messageSecurity = {
	name: 'message-security',
	inject: ['slots'],
	apply(ctx: Context) {
		ctx.slots.register('message.banners', {
			id: 'message-security',
			order: 0,
			component: SecurityBanner
		})
	}
}
