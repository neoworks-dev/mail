// The `reader` service: the reading area. It has one or two panes side by side, each with tabs,
// and back and forward over what the active pane showed. A tab shows a thread or a view another
// plugin draws, such as the digest, through the keyed `reading.view` slot.
//
// Opening a thread loads its messages, expands the newest, loads its body and its drawable
// document, and marks everything unread in it as seen.

import type { Context } from '@neoworks/extension-system'
import type { MailDocument } from '../../../shared/document'
import type { MessageBody, ThreadMessage } from '../../../shared/mail'

declare module '@neoworks/extension-system' {
	interface Context {
		reader: ReaderService
	}
}

export type ReadingView =
	| { kind: 'thread'; accountId: number; threadId: number }
	/** A view another plugin draws into the `reading.view` slot under this key. */
	| { kind: 'custom'; key: string; title: string }

export interface ReadingTab {
	id: number
	view: ReadingView
	title: string
	messages: ThreadMessage[]
	/** Message ids whose body is shown rather than collapsed to a summary row. */
	expanded: number[]
}

export interface ReadingPane {
	tabs: ReadingTab[]
	activeTabIndex: number
}

export interface ReaderState {
	panes: ReadingPane[]
	activePaneIndex: number
	history: ReadingView[]
	historyIndex: number
	/** Bodies by message id, shared by every tab. */
	bodies: Record<number, MessageBody>
	/** Drawable documents by message id. */
	documents: Record<number, MailDocument>
	/** Messages whose remote images the user chose to load. */
	remoteImagesAllowed: number[]
}

function createState(): ReaderState {
	const state: ReaderState = $state({
		panes: [{ tabs: [], activeTabIndex: 0 }],
		activePaneIndex: 0,
		history: [],
		historyIndex: -1,
		bodies: {},
		documents: {},
		remoteImagesAllowed: []
	})
	return state
}

export class ReaderService {
	readonly state = createState()
	private nextTabId = 1

	constructor(private ctx: Context) {}

	get activePane(): ReadingPane {
		const panes = this.state.panes
		return panes[Math.min(this.state.activePaneIndex, panes.length - 1)]
	}

	get activeTab(): ReadingTab | null {
		const pane = this.activePane
		if (pane.tabs.length === 0) return null
		return pane.tabs[Math.min(pane.activeTabIndex, pane.tabs.length - 1)]
	}

	/** The thread the active tab shows, or null. */
	get openThreadId(): number | null {
		const tab = this.activeTab
		if (!tab || tab.view.kind !== 'thread') return null
		return tab.view.threadId
	}

	get openMessages(): ThreadMessage[] {
		const tab = this.activeTab
		if (!tab) return []
		return tab.messages
	}

	get canGoBack(): boolean {
		return this.state.historyIndex > 0
	}

	get canGoForward(): boolean {
		return this.state.historyIndex < this.state.history.length - 1
	}

	/** The newest message of the open thread in the current folder: what thread actions apply to. */
	get actionTarget(): ThreadMessage | null {
		const messages = this.openMessages
		if (messages.length === 0) return null
		const folderId = this.ctx.mailbox.selectedFolderId
		if (folderId !== null) {
			const inFolder = messages.filter((message) => message.folderId === folderId)
			if (inFolder.length > 0) return inFolder[inFolder.length - 1]
		}
		return messages[messages.length - 1]
	}

	/** The newest message of the open thread: what a reply answers. */
	get replyTarget(): ThreadMessage | null {
		const messages = this.openMessages
		if (messages.length === 0) return null
		return messages[messages.length - 1]
	}

	/** Opens a thread, focusing the tab that already shows it, if any. */
	async openThread(accountId: number, threadId: number): Promise<void> {
		const view: ReadingView = { kind: 'thread', accountId, threadId }
		const existing = this.findThreadTab(threadId)
		if (!existing) {
			await this.openInNewTab(view)
			return
		}
		this.setActiveTab(existing.paneIndex, existing.tabIndex)
		this.pushHistory(view)
		await this.applyView(this.state.panes[existing.paneIndex].tabs[existing.tabIndex], view)
	}

	async openInNewTab(view: ReadingView): Promise<void> {
		const pane = this.activePane
		pane.tabs.push(this.blankTab(view))
		pane.activeTabIndex = pane.tabs.length - 1
		await this.navigateTo(view, true)
	}

	/** Shows a view in the active tab; `push` records it in the history. */
	async navigateTo(view: ReadingView, push: boolean): Promise<void> {
		if (push) this.pushHistory(view)
		await this.applyView(this.activeTabOrNew(view), view)
	}

	/** Opens a thread side by side, creating the second pane when needed. */
	async openInSplit(accountId: number, threadId: number): Promise<void> {
		if (this.state.panes.length === 1) this.state.panes.push({ tabs: [], activeTabIndex: 0 })
		this.state.activePaneIndex = this.state.panes.length - 1
		await this.navigateTo({ kind: 'thread', accountId, threadId }, true)
	}

	/** Splits the reading area showing the active view twice, or joins it back into one pane. */
	async toggleSplit(): Promise<void> {
		if (this.state.panes.length > 1) {
			this.state.panes = [this.state.panes[0]]
			this.state.activePaneIndex = 0
			return
		}
		const tab = this.activeTab
		this.state.panes.push({ tabs: [], activeTabIndex: 0 })
		this.state.activePaneIndex = 1
		if (tab) await this.navigateTo({ ...tab.view }, true)
	}

	setActivePane(paneIndex: number): void {
		if (paneIndex >= 0 && paneIndex < this.state.panes.length)
			this.state.activePaneIndex = paneIndex
	}

	setActiveTab(paneIndex: number, tabIndex: number): void {
		this.setActivePane(paneIndex)
		const pane = this.state.panes[paneIndex]
		if (tabIndex >= 0 && tabIndex < pane.tabs.length) pane.activeTabIndex = tabIndex
	}

	closePane(paneIndex: number): void {
		if (this.state.panes.length === 1) return
		this.state.panes = this.state.panes.filter((_, index) => index !== paneIndex)
		this.state.activePaneIndex = 0
	}

	closeTab(paneIndex: number, tabIndex: number): void {
		const pane = this.state.panes[paneIndex]
		if (!pane) return
		pane.tabs = pane.tabs.filter((_, index) => index !== tabIndex)
		if (pane.activeTabIndex >= pane.tabs.length)
			pane.activeTabIndex = Math.max(0, pane.tabs.length - 1)
		if (pane.tabs.length === 0 && this.state.panes.length > 1) this.closePane(paneIndex)
	}

	/** Closes the active tab. */
	closeActive(): void {
		const pane = this.activePane
		if (pane.tabs.length === 0) return
		this.closeTab(this.state.activePaneIndex, pane.activeTabIndex)
	}

	/** Closes every tab that shows a view with this key, such as a dismissed digest. */
	closeCustom(key: string): void {
		for (let paneIndex = this.state.panes.length - 1; paneIndex >= 0; paneIndex -= 1) {
			const tabs = this.state.panes[paneIndex].tabs
			for (let tabIndex = tabs.length - 1; tabIndex >= 0; tabIndex -= 1) {
				const view = tabs[tabIndex].view
				if (view.kind === 'custom' && view.key === key) this.closeTab(paneIndex, tabIndex)
			}
		}
	}

	async goBack(): Promise<void> {
		if (!this.canGoBack) return
		this.state.historyIndex -= 1
		const view = this.state.history[this.state.historyIndex]
		await this.applyView(this.activeTabOrNew(view), view)
	}

	async goForward(): Promise<void> {
		if (!this.canGoForward) return
		this.state.historyIndex += 1
		const view = this.state.history[this.state.historyIndex]
		await this.applyView(this.activeTabOrNew(view), view)
	}

	/** Steps to the next or previous thread of the list within the active tab. */
	async openAdjacent(offset: number): Promise<void> {
		const next = this.ctx.mailbox.adjacentThread(this.openThreadId, offset)
		if (!next) return
		await this.navigateTo(
			{ kind: 'thread', accountId: next.accountId, threadId: next.threadId },
			true
		)
	}

	isExpanded(tab: ReadingTab, messageId: number): boolean {
		return tab.expanded.includes(messageId)
	}

	async toggleExpanded(tab: ReadingTab, messageId: number): Promise<void> {
		if (tab.expanded.includes(messageId)) {
			tab.expanded = tab.expanded.filter((id) => id !== messageId)
			return
		}
		tab.expanded = [...tab.expanded, messageId]
		await this.loadMessage(messageId)
	}

	/** Loads a message's body and document, unless they are loaded already. */
	async loadMessage(messageId: number): Promise<void> {
		await Promise.all([this.loadBody(messageId), this.loadDocument(messageId)])
	}

	async loadBody(messageId: number): Promise<MessageBody | null> {
		const cached = this.state.bodies[messageId]
		if (cached) return cached
		const body = await this.ctx.sidecar.call('messages.body', messageId)
		if (body) this.state.bodies[messageId] = body
		return body
	}

	/** Drops a cached body, so the next load reads it again, such as after a shipment refresh. */
	async reloadBody(messageId: number): Promise<void> {
		delete this.state.bodies[messageId]
		await this.loadBody(messageId)
	}

	remoteImagesAllowed(messageId: number): boolean {
		return this.state.remoteImagesAllowed.includes(messageId)
	}

	/** Loads the message's remote images: the user agreed to tell the sender it was read. */
	async allowRemoteImages(messageId: number): Promise<void> {
		if (this.remoteImagesAllowed(messageId)) return
		this.state.remoteImagesAllowed = [...this.state.remoteImagesAllowed, messageId]
		delete this.state.documents[messageId]
		await this.loadDocument(messageId)
	}

	private async loadDocument(messageId: number): Promise<void> {
		if (this.state.documents[messageId]) return
		const document = await this.ctx.sidecar.call('messages.document', messageId, {
			remoteImages: this.remoteImagesAllowed(messageId)
		})
		if (document) this.state.documents[messageId] = document
	}

	private pushHistory(view: ReadingView): void {
		this.state.history = [...this.state.history.slice(0, this.state.historyIndex + 1), view]
		this.state.historyIndex = this.state.history.length - 1
	}

	private findThreadTab(threadId: number): { paneIndex: number; tabIndex: number } | null {
		for (let paneIndex = 0; paneIndex < this.state.panes.length; paneIndex += 1) {
			const tabs = this.state.panes[paneIndex].tabs
			const tabIndex = tabs.findIndex(
				(tab) => tab.view.kind === 'thread' && tab.view.threadId === threadId
			)
			if (tabIndex !== -1) return { paneIndex, tabIndex }
		}
		return null
	}

	private blankTab(view: ReadingView): ReadingTab {
		this.nextTabId += 1
		return { id: this.nextTabId, view, title: titleOf(view), messages: [], expanded: [] }
	}

	private activeTabOrNew(view: ReadingView): ReadingTab {
		const pane = this.activePane
		if (pane.tabs.length === 0) {
			pane.tabs.push(this.blankTab(view))
			pane.activeTabIndex = 0
		}
		return pane.tabs[Math.min(pane.activeTabIndex, pane.tabs.length - 1)]
	}

	private async applyView(tab: ReadingTab, view: ReadingView): Promise<void> {
		tab.view = view
		// The tab is $state, so reading `view` back gives its proxy; compare against that.
		const shown = tab.view
		tab.title = titleOf(view)
		tab.messages = []
		tab.expanded = []
		if (view.kind !== 'thread') return

		const messages = await this.ctx.sidecar.call('threads.messages', view.accountId, view.threadId)
		// Another view may have replaced this one while the messages loaded.
		if (tab.view !== shown) return
		tab.messages = messages
		const first = messages[0]
		if (first) tab.title = first.subject || first.fromName || first.fromAddress
		const latest = messages[messages.length - 1]
		if (latest) {
			tab.expanded = [latest.messageId]
			await this.loadMessage(latest.messageId)
		}
		this.markThreadSeen(messages)
		this.ctx.emit('reader/opened', view.accountId, view.threadId, messages)
	}

	private markThreadSeen(messages: ThreadMessage[]): void {
		for (const message of messages) {
			if (message.seen) continue
			message.seen = true
			void this.ctx.mailbox.markSeen(message, true)
		}
	}
}

function titleOf(view: ReadingView): string {
	if (view.kind === 'custom') return view.title
	return '…'
}
