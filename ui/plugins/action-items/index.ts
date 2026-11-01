// The things a message asks the user to do, as the agent found them, under its body. The
// `assistant.extractActions` command, in the thread toolbar's More menu, asks for them.

import type { Context } from '@neoworks/extension-system'
import ActionItemList from './ActionItemList.svelte'

export const actionItems = {
	name: 'action-items',
	inject: ['slots', 'assistant'],
	apply(ctx: Context) {
		ctx.slots.register('message.footer', {
			id: 'action-items',
			order: 20,
			component: ActionItemList,
			props: { assistant: ctx.assistant }
		})
	}
}
