import type {
	EmbeddingStatus,
	MailAccount,
	MailFolder,
	MessageBody,
	MessageSummary,
	OutgoingAttachment,
	OutgoingMessage,
	SyncStatus,
	ThreadMessage,
	ThreadSummary
} from '../../../shared/mail'
import { generateOnce, type GenerateHandle } from '../nib/generate'
import { parseActionsJson, parseDigestJson, parseShipmentJson } from './extraction'
import { extractQuote } from './quote'

const PAGE_SIZE = 100

/** Per-message cap when handing thread text to the model. */
const CONTEXT_BODY_LIMIT = 2500
/** Only the newest messages of long threads go into the context. */
const CONTEXT_MESSAGE_LIMIT = 12

const SUMMARY_SYSTEM_PROMPT =
	'You summarize email conversations. Reply with a compact summary of 2-4 sentences: who ' +
	'wants what, decisions made, and open questions or action items. No preamble, no headings.'

const DIGEST_SYSTEM_PROMPT =
	'You organize new email into a structured digest. Reply with ONLY JSON of the shape ' +
	'{"intro": string|null, "groups": [{"title": string, "items": [{"threadId": number, ' +
	'"note": string}]}]}. Use the thread ids given in the input. Group by importance: personal ' +
	'and urgent mail first, then notable updates, then bulk (newsletters/ads) last. Every note ' +
	'is one short sentence saying what the email is about or why it matters. No prose outside ' +
	'the JSON, no code fences.'

export interface DigestCard {
	threadId: number
	accountId: number
	sender: string
	subject: string
	snippet: string
	label: string | null
	note: string
}

export interface DigestGroup {
	title: string
	cards: DigestCard[]
}

export interface DailyDigestState {
	intro: string | null
	groups: DigestGroup[]
	/** Fallback when the model ignored the JSON contract. */
	prose: string | null
	generatedAt: string
	running: boolean
	error: string | null
}

const ACTIONS_SYSTEM_PROMPT =
	'You extract action items the recipient must do from emails. Reply with ONLY a JSON array ' +
	'of the shape [{"title": string, "due": string|null}] — due as ISO date or short phrase when ' +
	'the email names one. No prose, no code fences. Reply [] when there is nothing to do.'

const SHIPMENT_SYSTEM_PROMPT =
	'You extract shipment tracking information from emails. Reply with ONLY a JSON object of the ' +
	'shape {"carrier": string, "trackingNumber": string|null, "trackingUrl": string|null, ' +
	'"status": string|null, "deliveryDate": string|null}. No prose, no code fences. If the email ' +
	'is not about a shipment, reply exactly: null'

const REPLY_SYSTEM_PROMPT =
	'You draft email replies for the user. Write in the language of the conversation with a ' +
	'matching tone, concise and natural. Output only the reply body as plain markdown — no ' +
	'subject line, no quoted original, at most a simple closing.'

export interface ThreadSummaryState {
	text: string
	running: boolean
	error: string | null
}

/** What a reading tab shows: a conversation or the daily digest. */
export type ReadingView =
	| { kind: 'thread'; accountId: number; threadId: number }
	| { kind: 'digest' }

export interface ReadingTab {
	id: number
	view: ReadingView
	title: string
	messages: ThreadMessage[]
	bodies: Record<number, MessageBody>
	/** Sandboxed body iframes cannot report their height, so exactly one
	 * message per tab is expanded and its frame fills the pane. */
	expandedMessageId: number | null
}

export interface ReadingPaneState {
	tabs: ReadingTab[]
	activeTabIndex: number
}

/** A send held back by the undo window, or one that failed after it. */
export interface PendingSend {
	sendId: number
	to: string
	subject: string
	/** When the SMTP transaction fires; countdown target for the toast. */
	sendAt: number
	status: 'pending' | 'failed'
	errorMessage: string | null
	/** The payload, kept so Undo / a failure can restore the composer. */
	input: OutgoingMessage
}

export interface ComposeDraft {
	accountId: number
	to: string
	cc: string
	subject: string
	markdown: string
	replyToMessageId: number | null
	attachments: OutgoingAttachment[]
	/** Local message id of the last autosaved copy in the Drafts folder. */
	draftMessageId: number | null
}

class MailState {
	accounts = $state<MailAccount[]>([])
	accountsLoaded = $state(false)
	selectedAccountId = $state<number | null>(null)

	folders = $state<MailFolder[]>([])
	selectedFolderId = $state<number | null>(null)
	/** All-inboxes view across every account; exclusive with selectedFolderId. */
	unifiedInbox = $state(false)

	accountSetupOpen = $state(false)
	assistantOpen = $state(false)
	paletteOpen = $state(false)
	keybindingSettingsOpen = $state(false)

	threads = $state<ThreadSummary[]>([])
	totalThreads = $state(0)
	loadingThreads = $state(false)
	/** Category filter (newsletter/ad/…) applied to the thread list. */
	labelFilter = $state<string | null>(null)
	/** Multi-selection (ctrl/shift click) over the thread list. */
	selectedThreadIds = $state<number[]>([])
	/** Message counts per label for the selected account's inbox / all inboxes. */
	inboxLabelCounts = $state<Record<string, number>>({})
	unifiedLabelCounts = $state<Record<string, number>>({})

	/** Reading area: one or two split panes, each with its own tabs. */
	panes = $state<ReadingPaneState[]>([{ tabs: [], activeTabIndex: 0 }])
	activePaneIndex = $state(0)
	/** Back/forward navigation over views opened in the active pane. */
	private history = $state<ReadingView[]>([])
	private historyIndex = $state(-1)
	private nextTabId = 1

	get activePane(): ReadingPaneState {
		return this.panes[Math.min(this.activePaneIndex, this.panes.length - 1)]
	}

	get activeTab(): ReadingTab | null {
		const pane = this.activePane
		if (pane.tabs.length === 0) return null
		return pane.tabs[Math.min(pane.activeTabIndex, pane.tabs.length - 1)]
	}

	/** Compatibility getters: "the open thread" means the active pane's tab. */
	get openThreadId(): number | null {
		const tab = this.activeTab
		if (!tab || tab.view.kind !== 'thread') return null
		return tab.view.threadId
	}

	get threadMessages(): ThreadMessage[] {
		const tab = this.activeTab
		if (!tab) return []
		return tab.messages
	}

	get bodies(): Record<number, MessageBody> {
		const tab = this.activeTab
		if (!tab) return {}
		return tab.bodies
	}

	get expandedMessageId(): number | null {
		const tab = this.activeTab
		if (!tab) return null
		return tab.expandedMessageId
	}

	get canGoBack(): boolean {
		return this.historyIndex > 0
	}

	get canGoForward(): boolean {
		return this.historyIndex < this.history.length - 1
	}

	compose = $state<ComposeDraft | null>(null)
	/** Sends inside the undo window (plus failed ones awaiting dismissal). */
	pendingSends = $state<PendingSend[]>([])

	/** AI thread summaries, cached per thread id for this app run. */
	threadSummaries = $state<Record<number, ThreadSummaryState>>({})
	aiDrafting = $state(false)
	extractingShipment = $state(false)
	shipmentExtractionError = $state<string | null>(null)
	trackingShipment = $state(false)
	extractingActions = $state(false)
	dailyDigest = $state<DailyDigestState | null>(null)
	/** Text the command bar starts with on next open ('' = search, '>' = commands). */
	palettePrefill = $state('')
	private replyDraftHandle: GenerateHandle | null = null


	syncStatuses = $state<Record<number, SyncStatus>>({})
	embeddingStatus = $state<EmbeddingStatus | null>(null)

	async bootstrap(): Promise<void> {
		this.accounts = await window.neomail.accounts.list()
		this.accountsLoaded = true
		if (this.accounts.length > 0) {
			await this.selectAccount(this.accounts[0].accountId)
		}

		for (const status of await window.neomail.sync.statuses()) {
			this.syncStatuses[status.accountId] = status
		}

		window.neomail.on('event:sync-status', (payload) => {
			const status = payload as SyncStatus
			this.syncStatuses[status.accountId] = status
			// Folder counts move while a backfill runs; keep the sidebar fresh.
			void this.refreshFolders()
		})

		window.neomail.on('event:messages-changed', (payload) => {
			const change = payload as { accountId: number; folderId: number }
			void this.onMessagesChanged(change.accountId, change.folderId)
		})

		window.neomail.on('event:open-compose', () => {
			this.openCompose()
		})

		window.neomail.on('event:embedding-status', (payload) => {
			this.embeddingStatus = payload as EmbeddingStatus
		})

		window.neomail.on('event:digest-due', () => {
			void this.generateDigest(true)
		})

		window.neomail.on('event:send-done', (payload) => {
			const { sendId } = payload as { sendId: number }
			this.pendingSends = this.pendingSends.filter((entry) => entry.sendId !== sendId)
		})

		window.neomail.on('event:send-failed', (payload) => {
			const failure = payload as { sendId: number; errorMessage: string }
			for (const entry of this.pendingSends) {
				if (entry.sendId !== failure.sendId) continue
				entry.status = 'failed'
				entry.errorMessage = failure.errorMessage
			}
		})
	}

	/** Build the daily digest via nib; scheduled mornings or on demand. */
	async generateDigest(notify: boolean): Promise<void> {
		if (this.dailyDigest?.running) return
		const candidates = await window.neomail.digest.candidates()
		if (candidates.length === 0) {
			if (!notify) {
				this.dailyDigest = {
					intro: 'Nothing new since yesterday.',
					groups: [],
					prose: null,
					generatedAt: new Date().toISOString(),
					running: false,
					error: null
				}
				await this.navigateTo({ kind: 'digest' }, true)
			}
			return
		}

		const emptyDigest = (): DailyDigestState => ({
			intro: null,
			groups: [],
			prose: null,
			generatedAt: new Date().toISOString(),
			running: true,
			error: null
		})
		this.dailyDigest = emptyDigest()
		await this.navigateTo({ kind: 'digest' }, true)

		// First card per thread wins; the model references these ids.
		const byThread = new Map<number, (typeof candidates)[number]>()
		for (const candidate of candidates) {
			if (!byThread.has(candidate.threadId)) byThread.set(candidate.threadId, candidate)
		}
		const lines = [...byThread.values()].map((entry) => {
			const sender = entry.fromName !== '' ? entry.fromName : entry.fromAddress
			const labelNote = entry.label ? ` [${entry.label}]` : ''
			return `- [thread ${entry.threadId}] ${sender}: ${entry.subject}${labelNote} — ${entry.snippet}`
		})

		try {
			const handle = generateOnce({
				title: 'Daily digest',
				systemPrompt: DIGEST_SYSTEM_PROMPT,
				userMessage: `New unread email:\n\n${lines.join('\n')}`,
				onText: () => {}
			})
			const text = await handle.result
			const parsed = parseDigestJson(text)

			let groups: DigestGroup[] = []
			if (parsed) {
				groups = parsed.groups
					.map((group) => ({
						title: group.title,
						cards: group.items.flatMap((item) => {
							const candidate = byThread.get(item.threadId)
							if (!candidate) return []
							return [
								{
									threadId: candidate.threadId,
									accountId: candidate.accountId,
									sender: candidate.fromName !== '' ? candidate.fromName : candidate.fromAddress,
									subject: candidate.subject,
									snippet: candidate.snippet,
									label: candidate.label,
									note: item.note
								}
							]
						})
					}))
					.filter((group) => group.cards.length > 0)
			}
			this.dailyDigest = {
				intro: parsed ? parsed.intro : null,
				groups,
				prose: parsed ? null : text,
				generatedAt: new Date().toISOString(),
				running: false,
				error: null
			}
			if (notify && 'Notification' in window) {
				const notification = new Notification('Neomail daily digest', {
					body: `${byThread.size} new conversations — summary ready.`
				})
				notification.onclick = () => window.focus()
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.dailyDigest = { ...emptyDigest(), running: false, error: message }
		}
	}

	dismissDigest(): void {
		this.dailyDigest = null
		const tab = this.activeTab
		if (tab && tab.view.kind === 'digest') this.closeThread()
	}

	async selectAccount(accountId: number): Promise<void> {
		this.selectedAccountId = accountId
		this.selectedFolderId = null
		this.unifiedInbox = false
		await this.refreshFolders()
		const inbox = this.folders.find((folder) => folder.path === 'INBOX')
		if (inbox) {
			await this.selectFolder(inbox.folderId)
			return
		}
		if (this.folders.length > 0) {
			await this.selectFolder(this.folders[0].folderId)
		}
	}

	async refreshFolders(): Promise<void> {
		if (this.selectedAccountId === null) return
		this.folders = await window.neomail.folders.list(this.selectedAccountId)
		await this.refreshLabelCounts()
	}

	private async refreshLabelCounts(): Promise<void> {
		const inbox = this.folders.find((folder) => folder.path === 'INBOX')
		if (inbox) {
			this.inboxLabelCounts = toCountRecord(await window.neomail.labels.counts(inbox.folderId))
		} else {
			this.inboxLabelCounts = {}
		}
		if (this.accounts.length > 1) {
			this.unifiedLabelCounts = toCountRecord(await window.neomail.labels.counts(null))
		}
	}

	/** Folder navigation keeps reading tabs open, browser-style. */
	async selectFolder(folderId: number, label: string | null = null): Promise<void> {
		this.unifiedInbox = false
		this.selectedFolderId = folderId
		this.labelFilter = label
		this.selectedThreadIds = []
		this.threads = []
		this.totalThreads = 0
		await this.loadMoreThreads()
	}

	async selectUnifiedInbox(label: string | null = null): Promise<void> {
		this.unifiedInbox = true
		this.selectedFolderId = null
		this.labelFilter = label
		this.selectedThreadIds = []
		this.threads = []
		this.totalThreads = 0
		await this.loadMoreThreads()
	}

	toggleThreadSelection(threadId: number): void {
		if (this.selectedThreadIds.includes(threadId)) {
			this.selectedThreadIds = this.selectedThreadIds.filter((id) => id !== threadId)
			return
		}
		this.selectedThreadIds = [...this.selectedThreadIds, threadId]
	}

	setThreadSelection(threadIds: number[]): void {
		this.selectedThreadIds = threadIds
	}

	clearThreadSelection(): void {
		this.selectedThreadIds = []
	}

	private selectedThreads(): ThreadSummary[] {
		return this.threads.filter((thread) => this.selectedThreadIds.includes(thread.threadId))
	}

	async markSelectedRead(): Promise<void> {
		for (const thread of this.selectedThreads()) {
			if (thread.threadUnread === 0) continue
			thread.seen = true
			thread.threadUnread = 0
			await window.neomail.messages.markSeen(thread.messageId, true)
		}
		this.clearThreadSelection()
	}

	async archiveSelected(): Promise<void> {
		const selected = this.selectedThreads()
		this.clearThreadSelection()
		this.closeThread()
		for (const thread of selected) {
			await window.neomail.messages.archive(thread.messageId)
		}
	}

	async deleteSelected(): Promise<void> {
		const selected = this.selectedThreads()
		this.clearThreadSelection()
		this.closeThread()
		for (const thread of selected) {
			await window.neomail.messages.delete(thread.messageId)
		}
	}

	async loadMoreThreads(): Promise<void> {
		if (this.loadingThreads) return
		if (!this.unifiedInbox && this.selectedFolderId === null) return
		this.loadingThreads = true
		try {
			const page = await this.fetchThreadPage(PAGE_SIZE, this.threads.length)
			this.threads = [...this.threads, ...page.threads]
			this.totalThreads = page.total
		} finally {
			this.loadingThreads = false
		}
	}

	private fetchThreadPage(limit: number, offset: number): Promise<{ threads: ThreadSummary[]; total: number }> {
		if (this.unifiedInbox) {
			return window.neomail.threads.listUnified(limit, offset, this.labelFilter)
		}
		if (this.selectedFolderId === null) {
			return Promise.resolve({ threads: [], total: 0 })
		}
		return window.neomail.threads.list(this.selectedFolderId, limit, offset, this.labelFilter)
	}

	/** Relabel from the UI; user labels feed the ml classifier's training set. */
	async setMessageLabel(message: MessageSummary, label: string | null): Promise<void> {
		message.label = label
		for (const thread of this.threads) {
			if (thread.messageId === message.messageId) thread.label = label
		}
		for (const threadMessage of this.threadMessages) {
			if (threadMessage.messageId === message.messageId) threadMessage.label = label
		}
		await window.neomail.messages.setLabel(message.messageId, label)
	}

	setActivePane(paneIndex: number): void {
		if (paneIndex >= 0 && paneIndex < this.panes.length) this.activePaneIndex = paneIndex
	}

	setActiveTab(paneIndex: number, tabIndex: number): void {
		this.setActivePane(paneIndex)
		const pane = this.panes[paneIndex]
		if (tabIndex >= 0 && tabIndex < pane.tabs.length) pane.activeTabIndex = tabIndex
	}

	/** Open a thread; the newest message expands, everything unread is marked seen. */
	async openThread(summary: MessageSummary): Promise<void> {
		await this.openThreadById(summary.accountId, summary.threadId)
	}

	/**
	 * Open by ids alone — also used by the assistant's show_thread tool.
	 * Every open goes to its own tab; a thread already open in some tab is
	 * focused instead of duplicated.
	 */
	async openThreadById(accountId: number, threadId: number): Promise<void> {
		const view: ReadingView = { kind: 'thread', accountId, threadId }
		const existing = this.findThreadTab(threadId)
		if (existing) {
			this.setActiveTab(existing.paneIndex, existing.tabIndex)
			this.history = [...this.history.slice(0, this.historyIndex + 1), view]
			this.historyIndex = this.history.length - 1
			await this.applyView(this.panes[existing.paneIndex].tabs[existing.tabIndex], view)
			return
		}
		await this.openThreadInNewTab(accountId, threadId)
	}

	private findThreadTab(threadId: number): { paneIndex: number; tabIndex: number } | null {
		for (let paneIndex = 0; paneIndex < this.panes.length; paneIndex += 1) {
			const tabs = this.panes[paneIndex].tabs
			for (let tabIndex = 0; tabIndex < tabs.length; tabIndex += 1) {
				const view = tabs[tabIndex].view
				if (view.kind === 'thread' && view.threadId === threadId) {
					return { paneIndex, tabIndex }
				}
			}
		}
		return null
	}

	async openThreadInNewTab(accountId: number, threadId: number): Promise<void> {
		const pane = this.activePane
		pane.tabs.push(this.blankTab({ kind: 'thread', accountId, threadId }))
		pane.activeTabIndex = pane.tabs.length - 1
		await this.navigateTo({ kind: 'thread', accountId, threadId }, true)
	}

	/** Open a view side by side; creates the second pane when needed. */
	async openThreadInSplit(accountId: number, threadId: number): Promise<void> {
		if (this.panes.length === 1) {
			this.panes.push({ tabs: [], activeTabIndex: 0 })
		}
		this.activePaneIndex = this.panes.length - 1
		await this.navigateTo({ kind: 'thread', accountId, threadId }, true)
	}

	/** Duplicate the active view into a second pane (split toggle). */
	async toggleSplit(): Promise<void> {
		if (this.panes.length > 1) {
			this.panes = [this.panes[0]]
			this.activePaneIndex = 0
			return
		}
		const currentView = this.activeTab?.view
		this.panes.push({ tabs: [], activeTabIndex: 0 })
		this.activePaneIndex = 1
		if (currentView) await this.navigateTo({ ...currentView }, true)
	}

	closePane(paneIndex: number): void {
		if (this.panes.length === 1) return
		this.panes = this.panes.filter((_, index) => index !== paneIndex)
		this.activePaneIndex = 0
	}

	closeTab(paneIndex: number, tabIndex: number): void {
		const pane = this.panes[paneIndex]
		if (!pane) return
		pane.tabs = pane.tabs.filter((_, index) => index !== tabIndex)
		if (pane.activeTabIndex >= pane.tabs.length) {
			pane.activeTabIndex = Math.max(0, pane.tabs.length - 1)
		}
		if (pane.tabs.length === 0 && this.panes.length > 1) {
			this.closePane(paneIndex)
		}
	}

	async goBack(): Promise<void> {
		if (!this.canGoBack) return
		this.historyIndex -= 1
		await this.applyView(this.activePaneOrCreateTab(), this.history[this.historyIndex])
	}

	async goForward(): Promise<void> {
		if (!this.canGoForward) return
		this.historyIndex += 1
		await this.applyView(this.activePaneOrCreateTab(), this.history[this.historyIndex])
	}

	/** Show a view in the active tab; push records it in the history. */
	async navigateTo(view: ReadingView, push: boolean): Promise<void> {
		if (push) {
			this.history = [...this.history.slice(0, this.historyIndex + 1), view]
			this.historyIndex = this.history.length - 1
		}
		await this.applyView(this.activePaneOrCreateTab(), view)
	}

	private blankTab(view: ReadingView): ReadingTab {
		this.nextTabId += 1
		return {
			id: this.nextTabId,
			view,
			title: view.kind === 'digest' ? 'Digest' : '…',
			messages: [],
			bodies: {},
			expandedMessageId: null
		}
	}

	private activePaneOrCreateTab(): ReadingTab {
		const pane = this.activePane
		if (pane.tabs.length === 0) {
			pane.tabs.push(this.blankTab({ kind: 'digest' }))
			pane.activeTabIndex = 0
		}
		return pane.tabs[Math.min(pane.activeTabIndex, pane.tabs.length - 1)]
	}

	private async applyView(tab: ReadingTab, view: ReadingView): Promise<void> {
		this.shipmentExtractionError = null
		tab.view = view
		tab.messages = []
		tab.bodies = {}
		tab.expandedMessageId = null
		if (view.kind === 'digest') {
			tab.title = 'Digest'
			return
		}

		tab.messages = await window.neomail.threads.messages(view.accountId, view.threadId)
		const first = tab.messages[0]
		tab.title = first ? first.subject || first.fromName || first.fromAddress : 'Conversation'

		const latest = tab.messages[tab.messages.length - 1]
		if (latest) {
			tab.expandedMessageId = latest.messageId
			await this.loadBodyIn(tab, latest.messageId)
		}
		for (const message of tab.messages) {
			if (message.seen) continue
			message.seen = true
			void window.neomail.messages.markSeen(message.messageId, true)
		}
	}

	/** Close the active tab (Escape, post-archive/delete cleanup). */
	closeThread(): void {
		const pane = this.activePane
		if (pane.tabs.length === 0) return
		this.closeTab(this.activePaneIndex, pane.activeTabIndex)
	}

	async toggleExpanded(tab: ReadingTab, messageId: number): Promise<void> {
		if (tab.expandedMessageId === messageId) {
			tab.expandedMessageId = null
			return
		}
		tab.expandedMessageId = messageId
		await this.loadBodyIn(tab, messageId)
	}

	async loadBodyIn(tab: ReadingTab, messageId: number): Promise<void> {
		if (tab.bodies[messageId]) return
		const body = await window.neomail.messages.body(messageId)
		if (body) tab.bodies[messageId] = body
	}

	private async loadBody(messageId: number): Promise<void> {
		const tab = this.activeTab
		if (!tab) return
		await this.loadBodyIn(tab, messageId)
	}

	async toggleFlagged(message: MessageSummary): Promise<void> {
		const next = !message.flagged
		message.flagged = next
		for (const thread of this.threads) {
			if (thread.messageId === message.messageId) thread.flagged = next
		}
		for (const threadMessage of this.threadMessages) {
			if (threadMessage.messageId === message.messageId) threadMessage.flagged = next
		}
		await window.neomail.messages.setFlagged(message.messageId, next)
	}

	async markUnread(message: MessageSummary): Promise<void> {
		await window.neomail.messages.markSeen(message.messageId, false)
		this.closeThread()
	}

	async archiveMessage(message: MessageSummary): Promise<void> {
		this.closeThread()
		await window.neomail.messages.archive(message.messageId)
	}

	async deleteMessage(message: MessageSummary): Promise<void> {
		this.closeThread()
		await window.neomail.messages.delete(message.messageId)
	}

	async moveMessage(message: MessageSummary, targetFolderId: number): Promise<void> {
		this.closeThread()
		await window.neomail.messages.move(message.messageId, targetFolderId)
	}

	openCompose(): void {
		if (this.selectedAccountId === null) return
		this.compose = {
			accountId: this.selectedAccountId,
			to: '',
			cc: '',
			subject: '',
			markdown: '',
			replyToMessageId: null,
			attachments: [],
			draftMessageId: null
		}
	}

	openReply(message: ThreadMessage, replyAll: boolean): void {
		const body = this.bodies[message.messageId]
		const ownEmail = this.ownEmail(message.accountId)

		let to = message.fromAddress
		let cc = ''
		if (replyAll && body) {
			const others = [...body.toAddresses, ...body.ccAddresses]
				.map((entry) => entry.address)
				.filter((address) => address !== '' && address !== ownEmail && address !== message.fromAddress)
			cc = [...new Set(others)].join(', ')
		}
		if (to === ownEmail && body && body.toAddresses.length > 0) {
			// Replying to my own message: address the original recipients instead.
			to = body.toAddresses.map((entry) => entry.address).join(', ')
		}

		this.compose = {
			accountId: message.accountId,
			to,
			cc,
			subject: replySubject(message.subject),
			markdown: quoteForReply(message, body),
			replyToMessageId: message.messageId,
			attachments: [],
			draftMessageId: null
		}
	}

	/** Reopen a message from the Drafts folder in the composer. */
	async editDraft(message: ThreadMessage): Promise<void> {
		await this.loadBody(message.messageId)
		const body = this.bodies[message.messageId]
		let replyToMessageId: number | null = null
		if (message.inReplyTo) {
			replyToMessageId = await window.neomail.messages.byRfcId(message.accountId, message.inReplyTo)
		}
		this.compose = {
			accountId: message.accountId,
			to: body ? body.toAddresses.map((entry) => entry.address).join(', ') : '',
			cc: body ? body.ccAddresses.map((entry) => entry.address).join(', ') : '',
			subject: message.subject,
			markdown: body && body.textBody ? body.textBody : '',
			replyToMessageId,
			attachments: [],
			draftMessageId: message.messageId
		}
	}

	closeCompose(): void {
		this.cancelReplyDraft()
		this.compose = null
	}

	private composePayload(): OutgoingMessage | null {
		if (!this.compose) return null
		return {
			accountId: this.compose.accountId,
			to: this.compose.to,
			cc: this.compose.cc,
			subject: this.compose.subject,
			markdown: this.compose.markdown,
			replyToMessageId: this.compose.replyToMessageId,
			attachments: this.compose.attachments.map((attachment) => ({ ...attachment })),
			draftMessageId: this.compose.draftMessageId
		}
	}

	/** Queue the send behind the undo window and close the composer. */
	async sendCompose(): Promise<void> {
		const payload = this.composePayload()
		if (!payload) return
		this.cancelReplyDraft()
		const queued = await window.neomail.sendQueue.queue(payload)
		this.pendingSends = [
			...this.pendingSends,
			{
				sendId: queued.sendId,
				to: payload.to,
				subject: payload.subject,
				sendAt: queued.sendAt,
				status: 'pending',
				errorMessage: null,
				input: payload
			}
		]
		this.compose = null
	}

	/** Undo a queued send; reopens the composer when it was still cancellable. */
	async undoSend(sendId: number): Promise<void> {
		const restored = await window.neomail.sendQueue.cancel(sendId)
		this.pendingSends = this.pendingSends.filter((entry) => entry.sendId !== sendId)
		if (!restored) return
		this.restoreCompose(restored)
	}

	/** Reopen a failed send in the composer for another attempt. */
	reopenFailedSend(sendId: number): void {
		const entry = this.pendingSends.find((candidate) => candidate.sendId === sendId)
		if (!entry) return
		this.pendingSends = this.pendingSends.filter((candidate) => candidate.sendId !== sendId)
		this.restoreCompose(entry.input)
	}

	dismissPendingSend(sendId: number): void {
		this.pendingSends = this.pendingSends.filter((entry) => entry.sendId !== sendId)
	}

	private restoreCompose(input: OutgoingMessage): void {
		this.compose = {
			accountId: input.accountId,
			to: input.to,
			cc: input.cc,
			subject: input.subject,
			markdown: input.markdown,
			replyToMessageId: input.replyToMessageId,
			attachments: input.attachments.map((attachment) => ({ ...attachment })),
			draftMessageId: input.draftMessageId
		}
	}

	async saveComposeDraft(): Promise<void> {
		const payload = this.composePayload()
		if (!payload) return
		const draftMessageId = await window.neomail.drafts.save(payload)
		// The composer may have been closed or replaced while the save ran.
		if (this.compose && this.compose.accountId === payload.accountId) {
			this.compose.draftMessageId = draftMessageId
		}
	}

	async addComposeAttachments(): Promise<void> {
		if (!this.compose) return
		const picked = await window.neomail.compose.pickFiles()
		if (!this.compose || picked.length === 0) return
		const existing = new Set(this.compose.attachments.map((attachment) => attachment.path))
		const fresh = picked.filter((attachment) => !existing.has(attachment.path))
		this.compose.attachments = [...this.compose.attachments, ...fresh]
	}

	removeComposeAttachment(path: string): void {
		if (!this.compose) return
		this.compose.attachments = this.compose.attachments.filter(
			(attachment) => attachment.path !== path
		)
	}

	async addAccount(account: MailAccount): Promise<void> {
		this.accounts = [...this.accounts, account]
		this.accountSetupOpen = false
		await this.selectAccount(account.accountId)
	}

	private ownEmail(accountId: number): string {
		const account = this.accounts.find((entry) => entry.accountId === accountId)
		return account ? account.email : ''
	}

	private async onMessagesChanged(accountId: number, folderId: number): Promise<void> {
		if (accountId === this.selectedAccountId) {
			await this.refreshFolders()
		}
		const visible = this.unifiedInbox || folderId === this.selectedFolderId
		if (!visible) return
		// Reload the visible page from the top; keeps it simple during backfill.
		const page = await this.fetchThreadPage(Math.max(this.threads.length, PAGE_SIZE), 0)
		this.threads = page.threads
		this.totalThreads = page.total
	}

	/** Newest thread message in the selected folder — what toolbar actions apply to. */
	get actionTarget(): ThreadMessage | null {
		if (this.threadMessages.length === 0) return null
		if (this.selectedFolderId !== null) {
			const inFolder = this.threadMessages.filter(
				(message) => message.folderId === this.selectedFolderId
			)
			if (inFolder.length > 0) return inFolder[inFolder.length - 1]
		}
		return this.threadMessages[this.threadMessages.length - 1]
	}

	get replyTarget(): ThreadMessage | null {
		if (this.threadMessages.length === 0) return null
		return this.threadMessages[this.threadMessages.length - 1]
	}

	/** Load every body of the open thread and build a plain-text transcript. */
	private async threadContext(messages: ThreadMessage[]): Promise<string> {
		const recent = messages.slice(-CONTEXT_MESSAGE_LIMIT)
		await Promise.all(recent.map((message) => this.loadBody(message.messageId)))
		const sections = recent.map((message) => {
			const body = this.bodies[message.messageId]
			let text = message.snippet
			if (body && body.textBody) text = body.textBody
			if (text.length > CONTEXT_BODY_LIMIT) text = `${text.slice(0, CONTEXT_BODY_LIMIT)}\n[… truncated]`
			const sender = message.fromName !== '' ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress
			return `From: ${sender}\nDate: ${message.date}\nSubject: ${message.subject}\n\n${text}`
		})
		return sections.join('\n\n---\n\n')
	}

	async summarizeOpenThread(): Promise<void> {
		const threadId = this.openThreadId
		if (threadId === null || this.threadMessages.length === 0) return
		const existing = this.threadSummaries[threadId]
		if (existing && (existing.running || existing.text !== '')) return

		this.threadSummaries[threadId] = { text: '', running: true, error: null }
		try {
			const context = await this.threadContext(this.threadMessages)
			const handle = generateOnce({
				title: 'Thread summary',
				systemPrompt: SUMMARY_SYSTEM_PROMPT,
				userMessage: `Summarize this email conversation:\n\n${context}`,
				onText: (text) => {
					this.threadSummaries[threadId] = { text, running: true, error: null }
				}
			})
			const text = await handle.result
			this.threadSummaries[threadId] = { text, running: false, error: null }
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.threadSummaries[threadId] = { text: '', running: false, error: message }
		}
	}

	dismissSummary(threadId: number): void {
		delete this.threadSummaries[threadId]
	}

	/** Query the carrier API for the open message's shipment and refresh the card. */
	async refreshShipmentStatus(): Promise<void> {
		const target = this.actionTarget
		if (!target || this.trackingShipment) return
		this.trackingShipment = true
		this.shipmentExtractionError = null
		try {
			await window.neomail.messages.trackShipment(target.messageId)
			// Reload the body so the card shows the merged tracking payload.
			delete this.bodies[target.messageId]
			await this.loadBody(target.messageId)
		} catch (error) {
			this.shipmentExtractionError = error instanceof Error ? error.message : String(error)
		} finally {
			this.trackingShipment = false
		}
	}

	/** User-triggered AI action-item extraction over the open thread. */
	async aiExtractActions(): Promise<void> {
		const target = this.actionTarget
		if (!target || this.extractingActions) return
		this.extractingActions = true
		this.shipmentExtractionError = null
		try {
			const context = await this.threadContext(this.threadMessages)
			const handle = generateOnce({
				title: 'Action extraction',
				systemPrompt: ACTIONS_SYSTEM_PROMPT,
				userMessage: context,
				onText: () => {}
			})
			const items = parseActionsJson(await handle.result)
			if (items === null) {
				this.shipmentExtractionError = 'AI returned no usable action items.'
				return
			}
			await window.neomail.messages.saveActions(target.messageId, items)
			const body = this.bodies[target.messageId]
			if (body) body.actions = { items }
		} catch (error) {
			this.shipmentExtractionError = error instanceof Error ? error.message : String(error)
		} finally {
			this.extractingActions = false
		}
	}

	/**
	 * User-triggered AI shipment extraction for the open message. Never runs
	 * automatically — the parse-time heuristics are the only automatic path.
	 */
	async aiExtractShipment(): Promise<void> {
		const target = this.actionTarget
		if (!target || this.extractingShipment) return
		await this.loadBody(target.messageId)
		const body = this.bodies[target.messageId]
		if (!body) return

		this.extractingShipment = true
		this.shipmentExtractionError = null
		try {
			const text = body.textBody ? body.textBody.slice(0, 4000) : target.snippet
			const handle = generateOnce({
				title: 'Shipment extraction',
				systemPrompt: SHIPMENT_SYSTEM_PROMPT,
				userMessage: `From: ${target.fromAddress}\nSubject: ${target.subject}\n\n${text}`,
				onText: () => {}
			})
			const parsed = parseShipmentJson(await handle.result)
			if (!parsed) {
				this.shipmentExtractionError = 'No shipment information found in this message.'
				return
			}
			await window.neomail.messages.saveShipment(target.messageId, parsed)
			body.shipment = { ...parsed, source: 'ai' }
		} catch (error) {
			this.shipmentExtractionError = error instanceof Error ? error.message : String(error)
		} finally {
			this.extractingShipment = false
		}
	}

	/**
	 * Stream an AI-written reply into the composer, keeping the quoted
	 * original below the generated text. Any text the user already wrote above
	 * the quote is treated as guidance for the draft.
	 */
	async generateReplyDraft(): Promise<void> {
		const compose = this.compose
		if (!compose || compose.replyToMessageId === null || this.aiDrafting) return

		const account = this.accounts.find((entry) => entry.accountId === compose.accountId)
		const senderName = account ? account.email : 'the user'

		let context: string
		const inOpenThread = this.threadMessages.some(
			(message) => message.messageId === compose.replyToMessageId
		)
		if (inOpenThread) {
			context = await this.threadContext(this.threadMessages)
		} else {
			const body = await window.neomail.messages.body(compose.replyToMessageId)
			if (!body) return
			context = body.textBody ? body.textBody.slice(0, CONTEXT_BODY_LIMIT) : ''
		}

		const quote = extractQuote(compose.markdown)
		const guidance = compose.markdown.replace(quote, '').trim()
		let instruction = `Write the reply to the last message, sent as ${senderName}.`
		if (guidance !== '') {
			instruction += `\nGuidance from the user for this reply:\n${guidance}`
		}

		this.aiDrafting = true
		this.replyDraftHandle = generateOnce({
			title: 'Reply draft',
			systemPrompt: REPLY_SYSTEM_PROMPT,
			userMessage: `${context}\n\n---\n\n${instruction}`,
			onText: (text) => {
				if (this.compose !== compose) return
				compose.markdown = quote === '' ? text : `${text}\n\n${quote}`
			}
		})
		try {
			await this.replyDraftHandle.result
		} finally {
			this.aiDrafting = false
			this.replyDraftHandle = null
		}
	}

	cancelReplyDraft(): void {
		if (this.replyDraftHandle) this.replyDraftHandle.cancel()
		this.replyDraftHandle = null
		this.aiDrafting = false
	}

	/** j/k navigation: steps within the current tab instead of spawning tabs. */
	async openAdjacentThread(offset: number): Promise<void> {
		if (this.threads.length === 0) return
		const currentIndex = this.threads.findIndex((thread) => thread.threadId === this.openThreadId)
		let nextIndex = currentIndex + offset
		if (currentIndex === -1) nextIndex = 0
		if (nextIndex < 0 || nextIndex >= this.threads.length) return
		const next = this.threads[nextIndex]
		await this.navigateTo({ kind: 'thread', accountId: next.accountId, threadId: next.threadId }, true)
	}
}

function toCountRecord(rows: Array<{ label: string | null; count: number }>): Record<string, number> {
	const record: Record<string, number> = {}
	let total = 0
	for (const row of rows) {
		// The priority pseudo-label overlaps real rows; keep it out of the total.
		if (row.label === '__priority') {
			record['__priority'] = row.count
			continue
		}
		total += row.count
		if (row.label !== null) record[row.label] = row.count
	}
	record['__all'] = total
	return record
}

function replySubject(subject: string): string {
	if (/^re:/i.test(subject.trim())) return subject
	return `Re: ${subject}`
}

function quoteForReply(message: ThreadMessage, body: MessageBody | undefined): string {
	const sender = message.fromName !== '' ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress
	const date = new Date(message.date).toLocaleString()
	const original = body && body.textBody ? body.textBody : message.snippet
	const quoted = original
		.split('\n')
		.map((line) => `> ${line}`)
		.join('\n')
	return `\n\nOn ${date}, ${sender} wrote:\n\n${quoted}\n`
}

export const mailState = new MailState()
