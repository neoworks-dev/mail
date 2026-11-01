// The UI's plugins. Everything the window shows and does is one of these; the kernel only
// provides the sidecar connection, settings, commands, keys and slots. Order does not decide
// activation, since each plugin waits for what it injects.

import type { UiPlugin } from '../kernel/loader'
import { accountSetup } from './account-setup'
import { accounts } from './accounts'
import { actionItems } from './action-items'
import { assistant } from './assistant'
import { assistantPane } from './assistant-pane'
import { attachments } from './attachments'
import { composer } from './composer'
import { composerWindow } from './composer-window'
import { digest } from './digest'
import { frame } from './frame'
import { header } from './header'
import { mailbox } from './mailbox'
import { messageList } from './message-list'
import { messageSecurity } from './message-security'
import { outboxToast } from './outbox-toast'
import { palette } from './palette'
import { reader } from './reader'
import { readingPane } from './reading-pane'
import { shipments } from './shipments'
import { shortcuts } from './shortcuts'
import { sidebar } from './sidebar'
import { summaryCards } from './summary-cards'
import { theme } from './theme'
import { threadSummary } from './thread-summary'
import { unsubscribe } from './unsubscribe'

export const corePlugins: UiPlugin[] = [
	theme,
	accounts,
	mailbox,
	reader,
	composer,
	assistant,
	frame,
	header,
	sidebar,
	messageList,
	readingPane,
	messageSecurity,
	unsubscribe,
	attachments,
	summaryCards,
	shipments,
	actionItems,
	threadSummary,
	digest,
	composerWindow,
	outboxToast,
	palette,
	shortcuts,
	accountSetup,
	assistantPane
]
