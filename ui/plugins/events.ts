// The events UI plugins tell each other about, on the plugin context.

import type { ThreadMessage } from '../../shared/mail'

declare module '@neoworks/extension-system' {
	interface Events {
		/** The user picked an account; the mailbox opens its inbox. */
		'accounts/selected'(accountId: number): void
		/** A folder's messages changed on the server or locally. */
		'mail/changed'(accountId: number, folderId: number): void
		/** The composer is closing or sending; anything generating into it stops. */
		'composer/closing'(): void
		/** The agent wrote a reply for a message (or the composer's message, when null). */
		'assistant/reply-draft'(messageId: number | null, markdown: string): void
		/** A thread opened in the reading pane. */
		'reader/opened'(accountId: number, threadId: number, messages: ThreadMessage[]): void
	}
}

export {}
