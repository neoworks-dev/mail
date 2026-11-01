// Serves `messages.document`: a message body reduced to the blocks the reading pane draws.
// Inline parts referenced by `cid:` become `data:` URLs; remote images stay blocked unless the
// UI asks for them, since loading one tells the sender the mail was read.

import type { Context } from '@neoworks/extension-system'
import type { DocumentOptions, MailDocument } from '../../../shared/document'
import { htmlToDocument, textToDocument } from '../../mail/document'
import type { MailStore } from '../../mail/store'

declare module '../../../shared/routes' {
	interface Routes {
		'messages.document': (messageId: number, options: DocumentOptions) => MailDocument | null
	}
}

/** Inline images above this are left out rather than sent through the frame stream. */
const INLINE_IMAGE_MAX_BYTES = 4 * 1024 * 1024

export const reader = {
	name: 'reader',
	inject: ['store', 'rpc'],
	apply(ctx: Context) {
		ctx.rpc.handle('messages.document', (messageId, options) => documentFor(ctx.store, messageId, options))
	}
}

function documentFor(store: MailStore, messageId: number, options: DocumentOptions): MailDocument | null {
	const body = store.getMessageBody(messageId)
	if (!body) return null
	if (body.htmlBody !== null && body.htmlBody.trim() !== '') {
		const inlineParts = new Map<string, number>()
		for (const attachment of body.attachments) {
			if (attachment.contentId !== null) inlineParts.set(attachment.contentId, attachment.attachmentId)
		}
		return htmlToDocument(body.htmlBody, {
			remoteImages: options.remoteImages,
			resolveInlineImage: (contentId) => inlineImage(store, inlineParts.get(contentId))
		})
	}
	return textToDocument(body.textBody ?? '')
}

function inlineImage(store: MailStore, attachmentId: number | undefined): string | null {
	if (attachmentId === undefined) return null
	const attachment = store.getAttachment(attachmentId)
	if (!attachment) return null
	if (!attachment.contentType.startsWith('image/')) return null
	if (attachment.content.length > INLINE_IMAGE_MAX_BYTES) return null
	return `data:${attachment.contentType};base64,${attachment.content.toString('base64')}`
}
