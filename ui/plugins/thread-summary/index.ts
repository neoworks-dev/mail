// The agent's summary of a thread, above its messages, and the thread action that asks for it.

import type { Context } from '@neoworks/extension-system'
import SummarizeAction from './SummarizeAction.svelte'
import SummaryCard from './SummaryCard.svelte'

export const threadSummary = {
	name: 'thread-summary',
	inject: ['slots', 'assistant'],
	apply(ctx: Context) {
		ctx.slots.register('thread.header', {
			id: 'thread-summary',
			order: 0,
			component: SummaryCard,
			props: { assistant: ctx.assistant }
		})
		ctx.slots.register('thread.actions', {
			id: 'thread-summary.summarize',
			order: 10,
			component: SummarizeAction,
			props: { assistant: ctx.assistant }
		})
	}
}
