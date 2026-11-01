// The `mailbox` service: what the message list shows. A view is a folder of the selected account
// or every account's inbox at once, optionally narrowed to one label and by the list's filter
// chips; the list loads in pages
// and reloads from the top when its messages change. Actions on messages change the loaded rows
// at once, then ask the sidecar to make it so.

import type { Context } from '@neoworks/extension-system'
import {
	NO_THREAD_FILTER,
	type MessageSummary,
	type ThreadFilter,
	type ThreadPage,
	type ThreadSummary
} from '../../../shared/mail'

declare module '@neoworks/extension-system' {
	interface Context {
		mailbox: MailboxService
	}
}

const PAGE_SIZE = 100

export type MailboxView =
	| { kind: 'folder'; folderId: number; label: string | null }
	| { kind: 'unified'; label: string | null }

export interface MailboxState {
	view: MailboxView | null
	/** The filter chips' state; it stays when the view changes, except the sender. */
	filter: ThreadFilter
	threads: ThreadSummary[]
	totalThreads: number
	loading: boolean
	/** Thread ids picked with Ctrl or Shift for an action on several at once. */
	selectedThreadIds: number[]
}

function createState(): MailboxState {
	const state: MailboxState = $state({
		view: null,
		filter: { ...NO_THREAD_FILTER },
		threads: [],
		totalThreads: 0,
		loading: false,
		selectedThreadIds: []
	})
	return state
}

export class MailboxService {
	readonly state = createState()
	/** Counts loads, so a page that arrives after the view changed is dropped. */
	private generation = 0

	constructor(private ctx: Context) {}

	get selectedFolderId(): number | null {
		const view = this.state.view
		if (!view || view.kind !== 'folder') return null
		return view.folderId
	}

	get unified(): boolean {
		const view = this.state.view
		return view !== null && view.kind === 'unified'
	}

	get labelFilter(): string | null {
		const view = this.state.view
		if (!view) return null
		return view.label
	}

	async openFolder(folderId: number, label: string | null = null): Promise<void> {
		await this.open({ kind: 'folder', folderId, label })
	}

	async openUnified(label: string | null = null): Promise<void> {
		await this.open({ kind: 'unified', label })
	}

	/** Opens the selected account's inbox, or its first folder when it has none. */
	async openInbox(): Promise<void> {
		const inbox = this.ctx.accounts.inbox()
		if (inbox) {
			await this.openFolder(inbox.folderId)
			return
		}
		const first = this.ctx.accounts.state.folders[0]
		if (first) await this.openFolder(first.folderId)
	}

	/** Changes the filter and loads the view again from the top. */
	async setFilter(change: Partial<ThreadFilter>): Promise<void> {
		this.state.filter = { ...this.state.filter, ...change }
		const view = this.state.view
		if (view) await this.open(view)
	}

	async loadMore(): Promise<void> {
		if (this.state.loading || this.state.view === null) return
		const generation = this.generation
		this.state.loading = true
		try {
			const page = await this.fetchPage(PAGE_SIZE, this.state.threads.length)
			if (generation !== this.generation) return
			this.state.threads = [...this.state.threads, ...page.threads]
			this.state.totalThreads = page.total
		} finally {
			this.state.loading = false
		}
	}

	/** Reloads the loaded rows from the top, when the view's messages changed. */
	async reload(): Promise<void> {
		if (this.state.view === null) return
		const generation = this.generation
		const page = await this.fetchPage(Math.max(this.state.threads.length, PAGE_SIZE), 0)
		if (generation !== this.generation) return
		this.state.threads = page.threads
		this.state.totalThreads = page.total
	}

	/** Whether a change in this folder shows in the current view. */
	shows(folderId: number): boolean {
		const view = this.state.view
		if (!view) return false
		if (view.kind === 'unified') return true
		return view.folderId === folderId
	}

	toggleSelection(threadId: number): void {
		if (this.state.selectedThreadIds.includes(threadId)) {
			this.state.selectedThreadIds = this.state.selectedThreadIds.filter((id) => id !== threadId)
			return
		}
		this.state.selectedThreadIds = [...this.state.selectedThreadIds, threadId]
	}

	setSelection(threadIds: number[]): void {
		this.state.selectedThreadIds = threadIds
	}

	clearSelection(): void {
		this.state.selectedThreadIds = []
	}

	selectedThreads(): ThreadSummary[] {
		return this.state.threads.filter((thread) =>
			this.state.selectedThreadIds.includes(thread.threadId)
		)
	}

	async markSelectedRead(): Promise<void> {
		for (const thread of this.selectedThreads()) {
			if (thread.threadUnread === 0) continue
			thread.seen = true
			thread.threadUnread = 0
			await this.ctx.sidecar.call('messages.markSeen', thread.messageId, true)
		}
		this.clearSelection()
	}

	async archiveSelected(): Promise<void> {
		const selected = this.selectedThreads()
		this.clearSelection()
		for (const thread of selected) await this.ctx.sidecar.call('messages.archive', thread.messageId)
	}

	async deleteSelected(): Promise<void> {
		const selected = this.selectedThreads()
		this.clearSelection()
		for (const thread of selected) await this.ctx.sidecar.call('messages.delete', thread.messageId)
	}

	/** Flags or unflags a message, updating every loaded copy of it. */
	async toggleFlagged(message: MessageSummary): Promise<void> {
		const next = !message.flagged
		this.patchMessage(message.messageId, (summary) => {
			summary.flagged = next
		})
		message.flagged = next
		await this.ctx.sidecar.call('messages.setFlagged', message.messageId, next)
	}

	/** Marks a list row read or unread, as the row's hover action does. */
	async setThreadRead(thread: ThreadSummary, read: boolean): Promise<void> {
		thread.seen = read
		if (read) {
			thread.threadUnread = 0
		} else {
			thread.threadUnread = Math.max(thread.threadUnread, 1)
		}
		await this.ctx.sidecar.call('messages.markSeen', thread.messageId, read)
	}

	async markSeen(message: MessageSummary, seen: boolean): Promise<void> {
		this.patchMessage(message.messageId, (summary) => {
			summary.seen = seen
		})
		await this.ctx.sidecar.call('messages.markSeen', message.messageId, seen)
	}

	/** Relabels a message; a user label also trains the classifier. */
	async setLabel(message: MessageSummary, label: string | null): Promise<void> {
		message.label = label
		this.patchMessage(message.messageId, (summary) => {
			summary.label = label
		})
		await this.ctx.sidecar.call('messages.setLabel', message.messageId, label)
	}

	async archive(message: MessageSummary): Promise<void> {
		await this.withoutThread(message.threadId, () =>
			this.ctx.sidecar.call('messages.archive', message.messageId)
		)
	}

	async remove(message: MessageSummary): Promise<void> {
		await this.withoutThread(message.threadId, () =>
			this.ctx.sidecar.call('messages.delete', message.messageId)
		)
	}

	async move(message: MessageSummary, targetFolderId: number): Promise<void> {
		await this.withoutThread(message.threadId, () =>
			this.ctx.sidecar.call('messages.move', message.messageId, targetFolderId)
		)
	}

	/** Takes the thread out of the list while the server acts; a failure brings it back. */
	private async withoutThread(threadId: number, action: () => Promise<void>): Promise<void> {
		this.dropThread(threadId)
		try {
			await action()
		} catch (error) {
			await this.reload()
			throw error
		}
	}

	/** The loaded thread before or after one, for stepping through the list. */
	adjacentThread(threadId: number | null, offset: number): ThreadSummary | null {
		const threads = this.state.threads
		if (threads.length === 0) return null
		const index = threads.findIndex((thread) => thread.threadId === threadId)
		let next = index + offset
		if (index === -1) next = 0
		if (next < 0 || next >= threads.length) return null
		return threads[next]
	}

	private async open(view: MailboxView): Promise<void> {
		this.generation += 1
		if (!sameView(this.state.view, view)) this.state.filter.fromAddress = null
		this.state.view = view
		this.state.threads = []
		this.state.totalThreads = 0
		this.state.selectedThreadIds = []
		this.state.loading = false
		await this.loadMore()
	}

	private fetchPage(limit: number, offset: number): Promise<ThreadPage> {
		const view = this.state.view
		if (!view) return Promise.resolve({ threads: [], total: 0 })
		// A plain copy for the sidecar; `$state.snapshot` needs EventTarget, which the window lacks.
		const filter = { ...this.state.filter }
		if (view.kind === 'unified')
			return this.ctx.sidecar.call('threads.listUnified', limit, offset, view.label, filter)
		return this.ctx.sidecar.call('threads.list', view.folderId, limit, offset, view.label, filter)
	}

	private patchMessage(messageId: number, change: (summary: ThreadSummary) => void): void {
		for (const thread of this.state.threads) {
			if (thread.messageId === messageId) change(thread)
		}
	}

	/** Takes a thread out of the list at once, ahead of the sidecar's reload. */
	private dropThread(threadId: number): void {
		this.state.threads = this.state.threads.filter((thread) => thread.threadId !== threadId)
	}
}

function sameView(current: MailboxView | null, next: MailboxView): boolean {
	if (current === null || current.kind !== next.kind || current.label !== next.label) return false
	if (current.kind === 'folder' && next.kind === 'folder') return current.folderId === next.folderId
	return true
}
