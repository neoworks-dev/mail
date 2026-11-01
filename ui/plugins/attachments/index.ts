// A message's attached files under its body. Pressing one asks where to save it with the
// system's dialog, and the sidecar writes it there.

import type { Context } from '@neoworks/extension-system'
import AttachmentList from './AttachmentList.svelte'

export const attachments = {
	name: 'attachments',
	inject: ['slots', 'sidecar'],
	apply(ctx: Context) {
		ctx.slots.register('message.footer', {
			id: 'attachments',
			order: 0,
			component: AttachmentList,
			props: { sidecar: ctx.sidecar }
		})
	}
}
