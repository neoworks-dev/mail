// The services the reading pane's components draw from, handed down as one prop.

import type { ThreadMessage } from '../../../shared/mail'
import type { CommandsService } from '../../kernel/commands'
import type { SidecarService } from '../../kernel/sidecar/service'
import type { AccountsService } from '../accounts/service.svelte'
import type { ComposerService } from '../composer/service.svelte'
import type { MailboxService } from '../mailbox/service.svelte'
import type { ReaderService, ReadingTab } from '../reader/service.svelte'

export interface ReadingServices {
	sidecar: SidecarService
	reader: ReaderService
	mailbox: MailboxService
	accounts: AccountsService
	composer: ComposerService
	commands: CommandsService
}

/** What the thread's actions apply to: its newest message in the folder being shown, else its newest. */
export function actionTarget(services: ReadingServices, tab: ReadingTab): ThreadMessage | null {
	const messages = tab.messages
	if (messages.length === 0) return null
	const folderId = services.mailbox.selectedFolderId
	const inFolder = messages.filter((message) => message.folderId === folderId)
	if (inFolder.length > 0) return inFolder[inFolder.length - 1]
	return messages[messages.length - 1]
}

/** Whether the message sits in the account's drafts, so it is edited rather than replied to. */
export function isDraftMessage(services: ReadingServices, message: ThreadMessage): boolean {
	const folder = services.accounts.state.folders.find(
		(entry) => entry.folderId === message.folderId
	)
	if (!folder) return false
	return folder.specialUse === '\\Drafts' || folder.name === 'Drafts'
}

/** Opens an address from a message in the system's browser or mail app. */
export function openLink(services: ReadingServices, href: string): void {
	void services.sidecar.call('system.openUrl', href).catch(() => {})
}
