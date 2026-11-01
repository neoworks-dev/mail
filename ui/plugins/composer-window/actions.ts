// What the composer window needs from outside its services: recipient suggestions, the file
// dialog, and the message a reply answers. Built by the plugin with its context, so the
// component never holds the context itself.

import type { Context } from '@neoworks/extension-system'
import { files } from '@neoworks/svelte-gpui'
import type { ThreadMessage } from '../../../shared/mail'
import type { Suggestion } from './recipients'

export interface ComposerActions {
	suggest(accountId: number, term: string): Promise<Suggestion[]>
	/** Opens the system's file dialog and attaches what the user picked. */
	pickAttachments(): Promise<void>
	/** The message a reply answers, from the open thread or the store. */
	replyTarget(messageId: number): Promise<ThreadMessage | null>
	/** Opens a link from the preview in the system browser. */
	openLink(href: string): void
}

export function composerActions(ctx: Context): ComposerActions {
	return {
		suggest: (accountId, term) => ctx.sidecar.call('contacts.suggest', accountId, term),

		openLink(href) {
			void ctx.sidecar.call('system.openUrl', href).catch(() => {})
		},

		async pickAttachments() {
			const paths = await files.pickFiles({ multiple: true, prompt: 'Attach' })
			if (!paths || paths.length === 0) return
			const described = await ctx.sidecar.call('attachments.describeFiles', paths)
			ctx.composer.addAttachments(described)
		},

		async replyTarget(messageId) {
			const open = ctx.reader.openMessages.find((message) => message.messageId === messageId)
			if (open) return open
			const location = await ctx.sidecar.call('messages.locate', messageId)
			if (!location) return null
			const messages = await ctx.sidecar.call(
				'threads.messages',
				location.accountId,
				location.threadId
			)
			const found = messages.find((message) => message.messageId === messageId)
			if (!found) return null
			return found
		}
	}
}
