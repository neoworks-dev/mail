// Unsubscribes from the list a message came from. Preference order: RFC 8058 one-click POST
// (silent), mailto (sends the unsubscribe mail through the account), plain link (opened in the
// browser).

import type { Context } from '@neoworks/extension-system'
import { parseListUnsubscribe, parseMailto } from '../../mail/unsubscribe'

const ONE_CLICK_TIMEOUT_MS = 10_000

export const unsubscribe = {
	name: 'unsubscribe',
	inject: ['store', 'sender', 'opener', 'mailOps', 'rpc'],
	apply(ctx: Context) {
		ctx.rpc.handle('messages.unsubscribe', async (messageId) => {
			const info = ctx.store.getUnsubscribeHeader(messageId)
			if (!info) throw new Error('message has no unsubscribe header')
			const target = parseListUnsubscribe(info.header)

			if (target.url && info.oneClick) {
				const response = await fetch(target.url, {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body: 'List-Unsubscribe=One-Click',
					signal: AbortSignal.timeout(ONE_CLICK_TIMEOUT_MS)
				})
				if (!response.ok) throw new Error(`unsubscribe endpoint answered HTTP ${response.status}`)
				return 'posted'
			}

			if (target.mailto) {
				const request = parseMailto(target.mailto)
				if (!request) throw new Error('unusable mailto unsubscribe address')
				const location = ctx.mailOps.requireLocation(messageId)
				await ctx.sender.sendPlain(location.accountId, {
					to: request.to,
					subject: request.subject,
					markdown: request.body
				})
				return 'sent'
			}

			if (target.url) {
				ctx.opener.openUrl(target.url)
				return 'opened'
			}
			throw new Error('no usable unsubscribe target in the header')
		})
	}
}
