// The agent's summary of a thread, above its messages. The `assistant.summarize` command, in the
// thread toolbar's More menu, asks for it.

import type { Context } from '@neoworks/extension-system'
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
	}
}
