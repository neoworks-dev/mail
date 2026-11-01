// The reading area: draws the reader's panes and their tabs into the frame's `content` slot, and
// declares the places other plugins add to a thread and its messages.
//
// - `thread.header` (list; props `{ tab }`): above the messages, such as the summary.
// - `thread.actions` (list; props `{ tab }`): buttons in the thread's toolbar.
// - `message.banners` (list; props `{ message, body }`): notes above an expanded message's body.
// - `message.footer` (list; props `{ message, body }`): below the body, such as attachments.
// - `reading.view` (keyed): a tab's custom view, by the view's key, such as the digest.

import type { Context } from '@neoworks/extension-system'
import ReadingArea from './ReadingArea.svelte'
import type { ReadingServices } from './services'

export const readingPane = {
	name: 'reading-pane',
	inject: ['slots', 'sidecar', 'reader', 'mailbox', 'accounts', 'composer'],
	apply(ctx: Context) {
		ctx.slots.declare('thread.header', 'list')
		ctx.slots.declare('thread.actions', 'list')
		ctx.slots.declare('message.banners', 'list')
		ctx.slots.declare('message.footer', 'list')
		ctx.slots.declare('reading.view', 'keyed')

		const services: ReadingServices = {
			sidecar: ctx.sidecar,
			reader: ctx.reader,
			mailbox: ctx.mailbox,
			accounts: ctx.accounts,
			composer: ctx.composer
		}
		ctx.slots.register('content', { id: 'reading-pane', component: ReadingArea, props: { services } })
	}
}
