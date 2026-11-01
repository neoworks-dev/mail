// Offers to unsubscribe from the mailing list a message came from, when it carries a
// List-Unsubscribe header. The sidecar picks the way: a silent one-click request, a mail to the
// list, or the list's page in the browser.

import type { Context } from '@neoworks/extension-system'
import UnsubscribeBanner from './UnsubscribeBanner.svelte'

export const unsubscribe = {
	name: 'unsubscribe',
	inject: ['slots', 'sidecar'],
	apply(ctx: Context) {
		ctx.slots.register('message.banners', {
			id: 'unsubscribe',
			order: 10,
			component: UnsubscribeBanner,
			props: { sidecar: ctx.sidecar }
		})
	}
}
