// Summary cards at the top of a message, found at parse time from the sender's schema.org
// markup or a known sender's template, such as a bus booking or a GitHub pull request.

import type { Context } from '@neoworks/extension-system'
import SummaryCards from './SummaryCards.svelte'

export const summaryCards = {
	name: 'summary-cards',
	inject: ['slots', 'sidecar'],
	apply(ctx: Context) {
		ctx.slots.register('message.summary', {
			id: 'summary-cards',
			order: 20,
			component: SummaryCards,
			props: { sidecar: ctx.sidecar }
		})
	}
}
