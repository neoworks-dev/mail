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
		/** A thread opened in the reading pane. */
		'reader/opened'(accountId: number, threadId: number, messages: ThreadMessage[]): void
	}
}

export {}
