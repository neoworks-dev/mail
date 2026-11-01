// The services the reading pane's components draw from, handed down as one prop.

import type { ThreadMessage } from '../../../shared/mail'
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

/** Opens an address from a message in the system's browser or mail app. */
export function openLink(services: ReadingServices, href: string): void {
	void services.sidecar.call('system.openUrl', href).catch(() => {})
}
