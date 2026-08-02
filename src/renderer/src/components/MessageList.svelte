<script lang="ts">
	import { Button, Tooltip } from '@neoworks-dev/ui'
	import type { ThreadSummary } from '../../../shared/mail'
	import { ArchiveIcon, CaretDownIcon, EnvelopeSimpleIcon, TrashIcon, XIcon } from '../icons'
	import {
		buildThreadListItems,
		bundleSenders,
		bundleUnreadCount,
		visibleThreads,
		type ThreadListItem
	} from '../state/bundling'
	import { mailState } from '../state/mail.svelte'
	import ThreadContextMenu from './ThreadContextMenu.svelte'

	/** Rows rendered above/below the viewport to hide scroll pop-in. */
	const OVERSCAN_ROWS = 8
	const DEFAULT_ROW_HEIGHT = 76

	let contextMenu = $state<{ x: number; y: number; thread: ThreadSummary } | null>(null)
	/** Anchor row for shift-click range selection, as an ordinal into the visible thread rows. */
	let selectionAnchorOrdinal = $state<number | null>(null)
	let expandedBundleLabels = $state<Set<string>>(new Set())

	let listElement = $state<HTMLElement | null>(null)
	let scrollTop = $state(0)
	let viewportHeight = $state(0)
	let rowHeight = $state(DEFAULT_ROW_HEIGHT)

	/** Bundling applies to the plain inbox view only, never to label-filtered lists. */
	const bundlingEnabled = $derived.by(() => {
		if (mailState.labelFilter !== null) return false
		if (mailState.unifiedInbox) return true
		const folder = mailState.folders.find(
			(entry) => entry.folderId === mailState.selectedFolderId
		)
		return folder !== undefined && folder.path === 'INBOX'
	})

	const displayItems = $derived(
		buildThreadListItems(mailState.threads, bundlingEnabled, expandedBundleLabels)
	)

	/** Thread rows in display order; shift-range selection works over these. */
	const orderedThreads = $derived(visibleThreads(displayItems))

	/** Each display item with its ordinal among visible thread rows (-1 for bundles). */
	const rowEntries = $derived.by(() => {
		let ordinal = 0
		return displayItems.map((item) => {
			if (item.type !== 'thread') return { item, ordinal: -1 }
			const entry = { item, ordinal }
			ordinal += 1
			return entry
		})
	})

	const visibleStart = $derived(
		Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS)
	)
	const visibleEnd = $derived(
		Math.min(
			rowEntries.length,
			Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS
		)
	)
	const visibleEntries = $derived(rowEntries.slice(visibleStart, visibleEnd))
	const topPadding = $derived(visibleStart * rowHeight)
	const bottomPadding = $derived((rowEntries.length - visibleEnd) * rowHeight)

	// Rows have uniform height per view mode; measure a real one instead of
	// trusting the estimate, so the spacer math stays exact.
	$effect(() => {
		void visibleEntries.length
		void mailState.unifiedInbox
		if (!listElement) return
		const row = listElement.querySelector('[data-virtual-row]') as HTMLElement | null
		if (row && row.offsetHeight > 0 && row.offsetHeight !== rowHeight) {
			rowHeight = row.offsetHeight
		}
	})

	// Collapse bundles and reset scroll when the folder or view changes.
	$effect(() => {
		void mailState.selectedFolderId
		void mailState.unifiedInbox
		void mailState.labelFilter
		expandedBundleLabels = new Set()
		selectionAnchorOrdinal = null
		scrollTop = 0
		if (listElement) listElement.scrollTop = 0
	})

	function toggleBundle(label: string): void {
		const next = new Set(expandedBundleLabels)
		if (next.has(label)) {
			next.delete(label)
		} else {
			next.add(label)
		}
		expandedBundleLabels = next
	}

	async function openBundleAsFilter(label: string): Promise<void> {
		if (mailState.unifiedInbox) {
			await mailState.selectUnifiedInbox(label)
			return
		}
		if (mailState.selectedFolderId !== null) {
			await mailState.selectFolder(mailState.selectedFolderId, label)
		}
	}

	function onRowContextMenu(event: MouseEvent, thread: ThreadSummary): void {
		event.preventDefault()
		contextMenu = { x: event.clientX, y: event.clientY, thread }
	}

	function onRowClick(event: MouseEvent, thread: ThreadSummary, ordinal: number): void {
		if (event.shiftKey && selectionAnchorOrdinal !== null) {
			const start = Math.min(selectionAnchorOrdinal, ordinal)
			const end = Math.max(selectionAnchorOrdinal, ordinal)
			mailState.setThreadSelection(
				orderedThreads.slice(start, end + 1).map((entry) => entry.threadId)
			)
			return
		}
		if (event.ctrlKey || event.metaKey) {
			selectionAnchorOrdinal = ordinal
			mailState.toggleThreadSelection(thread.threadId)
			return
		}
		selectionAnchorOrdinal = ordinal
		mailState.clearThreadSelection()
		void mailState.openThread(thread)
	}

	function isRowSelected(thread: ThreadSummary): boolean {
		return mailState.selectedThreadIds.includes(thread.threadId)
	}

	const LABEL_TITLES: Record<string, string> = {
		newsletter: 'Newsletter',
		ad: 'Ads',
		notification: 'Updates',
		social: 'Social',
		spam: 'Spam'
	}

	function labelTone(label: string): string {
		if (label === 'spam') return 'bg-red-soft text-red border-red/40'
		if (label === 'ad') return 'bg-amber-soft text-amber border-amber/40'
		if (label === 'newsletter') return 'bg-blue-soft text-blue border-blue/40'
		if (label === 'notification') return 'bg-violet-soft text-violet border-violet/40'
		if (label === 'social') return 'bg-green-soft text-green border-green/40'
		return 'text-faint border-line'
	}

	function onScroll(event: Event): void {
		const element = event.currentTarget as HTMLElement
		scrollTop = element.scrollTop
		const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 200
		if (!nearBottom) return
		if (mailState.threads.length >= mailState.totalThreads) return
		void mailState.loadMoreThreads()
	}

	function senderLabel(thread: ThreadSummary): string {
		if (thread.fromName !== '') return thread.fromName
		return thread.fromAddress
	}

	function unread(thread: ThreadSummary): boolean {
		return thread.threadUnread > 0
	}

	function accountLabel(thread: ThreadSummary): string {
		const account = mailState.accounts.find((entry) => entry.accountId === thread.accountId)
		if (!account) return ''
		return account.email
	}

	function formatDate(iso: string): string {
		const date = new Date(iso)
		const now = new Date()
		if (date.toDateString() === now.toDateString()) {
			return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
		}
		return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
	}

	function bundleTitle(item: ThreadListItem & { type: 'bundle' }): string {
		return LABEL_TITLES[item.label] || item.label
	}
</script>

<div
	class="flex min-w-0 flex-1 flex-col overflow-y-auto"
	onscroll={onScroll}
	bind:this={listElement}
	bind:clientHeight={viewportHeight}
>
	{#if mailState.selectedThreadIds.length > 0}
		<div class="border-line-faint bg-raised sticky top-0 z-10 flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
			<span class="min-w-0 flex-1 truncate text-xs font-medium">
				{mailState.selectedThreadIds.length} selected
			</span>
			<Tooltip text="Mark as read" placement="bottom">
				<Button
					variant="ghost"
					size="sm"
					icon={EnvelopeSimpleIcon}
					onclick={() => void mailState.markSelectedRead()}
				/>
			</Tooltip>
			<Tooltip text="Archive" placement="bottom">
				<Button
					variant="ghost"
					size="sm"
					icon={ArchiveIcon}
					onclick={() => void mailState.archiveSelected()}
				/>
			</Tooltip>
			<Tooltip text="Delete" placement="bottom">
				<Button
					variant="ghost"
					size="sm"
					icon={TrashIcon}
					onclick={() => void mailState.deleteSelected()}
				/>
			</Tooltip>
			<Tooltip text="Clear selection" placement="bottom">
				<Button variant="ghost" size="sm" icon={XIcon} onclick={() => mailState.clearThreadSelection()} />
			</Tooltip>
		</div>
	{/if}

	{#if mailState.threads.length === 0 && !mailState.loadingThreads}
		<p class="text-faint p-6 text-center text-sm">No messages yet</p>
	{/if}

	{#if topPadding > 0}
		<div style="height: {topPadding}px" class="shrink-0"></div>
	{/if}

	{#each visibleEntries as entry (entry.item.type === 'thread' ? `t${entry.item.thread.threadId}` : `b${entry.item.label}`)}
		{#if entry.item.type === 'bundle'}
			{@const bundle = entry.item}
			{@const unreadCount = bundleUnreadCount(bundle.threads)}
			<button
				data-virtual-row
				class="border-line-faint hover:bg-hover flex w-full flex-col gap-0.5 border-b px-4 py-2.5 text-left select-none"
				onclick={() => toggleBundle(bundle.label)}
			>
				<div class="flex items-baseline justify-between gap-2">
					<span class="flex min-w-0 items-baseline gap-1.5">
						<span class="rounded-full border px-1.5 text-[10px] {labelTone(bundle.label)}">
							{bundleTitle(bundle)}
						</span>
						<span class="truncate text-sm {unreadCount > 0 ? 'font-semibold' : 'text-muted'}">
							{bundle.threads.length}
							{bundle.threads.length === 1 ? 'conversation' : 'conversations'}
						</span>
						{#if unreadCount > 0}
							<span class="text-faint shrink-0 text-xs tabular-nums">{unreadCount} unread</span>
						{/if}
					</span>
					<span class="flex shrink-0 items-baseline gap-1.5">
						<span class="text-faint text-xs tabular-nums">{formatDate(bundle.threads[0].date)}</span>
						<CaretDownIcon
							size={12}
							class="text-faint transition-transform {bundle.expanded ? 'rotate-180' : ''}"
						/>
					</span>
				</div>
				<span class="text-muted truncate text-sm">
					{bundleSenders(bundle.threads, 3).join(', ')}
				</span>
				<span
					class="text-faint hover:text-default truncate text-xs underline"
					role="link"
					tabindex="-1"
					onclick={(event) => {
						event.stopPropagation()
						void openBundleAsFilter(bundle.label)
					}}
					onkeydown={(event) => {
						if (event.key === 'Enter') void openBundleAsFilter(bundle.label)
					}}
				>
					View all {bundleTitle(bundle).toLowerCase()}
				</span>
			</button>
		{:else}
			{@const thread = entry.item.thread}
			<button
				data-virtual-row
				class="border-line-faint hover:bg-hover flex w-full flex-col gap-0.5 border-b px-4 py-2.5 text-left select-none
					{isRowSelected(thread)
					? 'bg-raised ring-line-strong ring-1 ring-inset'
					: mailState.openThreadId === thread.threadId
						? 'bg-raised'
						: ''}"
				onclick={(event) => onRowClick(event, thread, entry.ordinal)}
				onauxclick={(event) => {
					if (event.button === 1) void mailState.openThreadInNewTab(thread.accountId, thread.threadId)
				}}
				oncontextmenu={(event) => onRowContextMenu(event, thread)}
			>
				<div class="flex items-baseline justify-between gap-2">
					<span class="flex min-w-0 items-baseline gap-1.5">
						<span class="truncate text-sm {unread(thread) ? 'font-semibold' : 'text-muted'}">
							{senderLabel(thread)}
						</span>
						{#if thread.threadTotal > 1}
							<span class="text-faint shrink-0 text-xs tabular-nums">{thread.threadTotal}</span>
						{/if}
					</span>
					<span class="flex shrink-0 items-baseline gap-1.5">
						{#if thread.label}
							<span class="rounded-full border px-1.5 text-[10px] {labelTone(thread.label)}">
								{LABEL_TITLES[thread.label] || thread.label}
							</span>
						{/if}
						{#if thread.flagged}
							<span class="text-amber text-xs" title="Flagged">★</span>
						{/if}
						<span class="text-faint text-xs tabular-nums">{formatDate(thread.date)}</span>
					</span>
				</div>
				<span class="truncate text-sm {unread(thread) ? 'text-default font-medium' : 'text-muted'}">
					{thread.subject || '(no subject)'}
				</span>
				<span class="text-faint truncate text-xs">{thread.snippet}</span>
				{#if mailState.unifiedInbox && accountLabel(thread) !== ''}
					<span class="text-faint border-line mt-0.5 self-start rounded border px-1 text-[10px]">
						{accountLabel(thread)}
					</span>
				{/if}
			</button>
		{/if}
	{/each}

	{#if bottomPadding > 0}
		<div style="height: {bottomPadding}px" class="shrink-0"></div>
	{/if}

	{#if mailState.loadingThreads}
		<p class="text-faint p-3 text-center text-xs">Loading…</p>
	{/if}
</div>

{#if contextMenu}
	<ThreadContextMenu
		x={contextMenu.x}
		y={contextMenu.y}
		thread={contextMenu.thread}
		onClose={() => (contextMenu = null)}
	/>
{/if}
