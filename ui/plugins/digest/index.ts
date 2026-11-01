// The daily digest as a tab of its own: the agent's groups of new conversations, each card
// opening its thread. Drawn into the reading area's `reading.view` slot under the digest's key.

import type { Context } from '@neoworks/extension-system'
import { DIGEST_VIEW_KEY } from '../assistant/service.svelte'
import DigestView from './DigestView.svelte'

export const digest = {
	name: 'digest',
	inject: ['slots', 'sidecar', 'reader', 'assistant'],
	apply(ctx: Context) {
		ctx.slots.register('reading.view', {
			id: 'digest',
			key: DIGEST_VIEW_KEY,
			component: DigestView,
			props: { sidecar: ctx.sidecar, reader: ctx.reader, assistant: ctx.assistant }
		})
	}
}
