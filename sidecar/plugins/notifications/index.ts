// Shows a desktop notification when new mail arrives after an account's first full sync.

import type { Context } from '@neoworks/extension-system'
import type { NewMessageInfo } from '../../mail/sync'

const PREVIEW_SENDERS = 3

export const notifications = {
	name: 'notifications',
	inject: ['opener'],
	apply(ctx: Context) {
		ctx.on('mail/new-messages', (messages) => {
			if (messages.length === 0) return
			const notice = describeNewMessages(messages)
			ctx.opener.notify(notice.title, notice.body)
		})
	}
}

export function describeNewMessages(messages: NewMessageInfo[]): { title: string; body: string } {
	if (messages.length === 1) {
		const message = messages[0]
		let title = message.fromAddress
		if (message.fromName !== '') title = message.fromName
		let body = '(no subject)'
		if (message.subject !== '') body = message.subject
		return { title, body }
	}
	const senders = messages.slice(0, PREVIEW_SENDERS).map((message) => {
		if (message.fromName !== '') return message.fromName
		return message.fromAddress
	})
	return { title: `${messages.length} new messages`, body: senders.join(', ') }
}
