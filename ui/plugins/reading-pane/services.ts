// The services the reading pane's components draw from, handed down as one prop.

import type { SidecarService } from '../../kernel/sidecar/service'
import type { AccountsService } from '../accounts/service.svelte'
import type { ComposerService } from '../composer/service.svelte'
import type { MailboxService } from '../mailbox/service.svelte'
import type { ReaderService } from '../reader/service.svelte'

export interface ReadingServices {
	sidecar: SidecarService
	reader: ReaderService
	mailbox: MailboxService
	accounts: AccountsService
	composer: ComposerService
}

/** Opens an address from a message in the system's browser or mail app. */
export function openLink(services: ReadingServices, href: string): void {
	void services.sidecar.call('system.openUrl', href).catch(() => {})
}
