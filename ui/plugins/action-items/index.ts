// The things a message asks the user to do, as the agent found them, under its body; and the
// thread action that asks the agent to find them.

import type { Context } from '@neoworks/extension-system'
import ActionItemList from './ActionItemList.svelte'
import ExtractActionsAction from './ExtractActionsAction.svelte'

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
		ctx.slots.register('thread.actions', {
			id: 'action-items.extract',
			order: 30,
			component: ExtractActionsAction,
			props: { assistant: ctx.assistant }
		})
	}
}
