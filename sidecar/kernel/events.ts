// The events sidecar plugins tell each other about, on the plugin context. The UI hears its
// own copies of some of them through `rpc.broadcast` (see `shared/routes.ts`).

import type { NewMessageInfo } from '../mail/sync'

declare module '@neoworks/extension-system' {
	interface Events {
		/** Messages in a folder were added, removed or changed. */
		'mail/messages-changed'(accountId: number, folderId: number): void
		/** New unseen INBOX mail arrived after an account's first full sync. */
		'mail/new-messages'(messages: NewMessageInfo[]): void
		'mail/account-added'(accountId: number): void
		/** Fired before the account's rows are deleted, so its connections can close first. */
		'mail/account-removing'(accountId: number): Promise<void>
		'mail/account-removed'(accountId: number): void
		/** A batch of messages got embeddings. */
		'mail/embedded'(): void
	}
}

export {}
